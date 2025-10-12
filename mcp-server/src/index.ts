#!/usr/bin/env node
/**
 * @file index.ts
 * @description OpenDigger MCP Server - A server for fetching, analyzing, and comparing open-source metrics.
 *
 * This server provides tools and prompts for:
 * - Fetching single or batch metrics from OpenDigger
 * - Comparing repositories across key metrics
 * - Analyzing trends over time
 * - Generating ecosystem insights
 * - Providing server health and cache statistics
 *
 * Features:
 * - Enhanced error handling and suggestions
 * - Batch processing with rate limiting
 * - Caching with TTL support
 * - SSE (Server-Sent Events) for real-time updates
 * - Comprehensive prompts for analysis and visualization
 * - Health monitoring and performance metrics
 *
 * Environment Variables:
 * - CACHE_TTL_SECONDS: Cache time-to-live in seconds (default: 300)
 * - SSE_PORT: Port for SSE HTTP server (optional)
 * - SSE_HOST: Host for SSE HTTP server (default: 0.0.0.0)
 *
 * Dependencies:
 * - @modelcontextprotocol/sdk
 * - zod, zod-to-json-schema
 * - node:http, node:url
 * - Custom utilities: utils.js, version.js, analysis.js
 */


import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { fetchWithCache, getCacheStats, clearExpiredCache } from './utils.js';
import { VERSION } from './version.js';
import { generateComparisonAnalysis, processTrendData, extractLatestValue, generateErrorSuggestions, calculateHealthScore } from './analysis.js';


const server = new Server(
  {
    name: 'open-digger-mcp-server',
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
  }
);

const BASE_URL = 'https://oss.open-digger.cn/';
const DEFAULT_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 300);
const BATCH_SIZE = 5;



function buildUrl(args: z.infer<typeof inputSchema>): string {
  const platform = args.platform.toString().toLowerCase();
  if (args.entityType === 'Repo') {
    if (!args.owner || !args.repo) throw new Error('Missing required fields: owner, repo');
    return `${BASE_URL}${platform}/${args.owner}/${args.repo}/${args.metricName}.json`;
  }
  if (!args.login) throw new Error('Missing required field: login');
  return `${BASE_URL}${platform}/${args.login}/${args.metricName}.json`;
}


// Input schema (with metrics)
const inputSchema = z.object({
  platform: z.enum(['GitHub', 'Gitee']).describe('Platform of the repo or user (GitHub, Gitee).'),
  entityType: z.enum(['Repo', 'User']).describe('What is the entity of the metric (Repo, User).'),
  owner: z.string().optional().describe('The owner name of the repo to get a metric data.'),
  repo: z.string().optional().describe('The repo name of the repo to get a metric data.'),
  login: z.string().optional().describe('The user login to get a metric data of a user.'),
  metricName: z.enum([
    'openrank',
    'stars',
    'forks',
    'participants',
    'contributors',
    'issues_new',
    'issues_closed',
    'change_requests',
    'pull_requests',
    'pull_requests_accepted',
    'issue_comments',
    'commits',
    'activity',
    'technical_fork',
    'bus_factor',
    'releases',
    'inactive_contributors',
    'pull_requests_merged',
    'issue_response_time',
    'maintainer_count',
    'code_change_lines',
    'community_activity',
    'developer_network'
  ]).describe('The metric name to get the data.'),
});


const batchInputSchema = z.object({
  requests: z.array(inputSchema).min(1).max(20).describe('Batch of up to 20 requests'),
}).describe('Batch request payload for fetching multiple metrics in one call');

const compareReposSchema = z.object({
  repositories: z.array(z.object({
    platform: z.enum(['GitHub', 'Gitee']),
    owner: z.string(),
    repo: z.string()
  })).min(2).max(5).describe('2-5 repositories to compare'),
  metrics: z.array(z.enum([
    'openrank', 'stars', 'forks', 'participants', 'contributors',
    'issues_new', 'issues_closed', 'pull_requests', 'commits',
    'technical_fork', 'bus_factor', 'releases'
  ])).optional().describe('Metrics to compare (default: openrank, stars, contributors)')
});

const trendAnalysisSchema = z.object({
  platform: z.enum(['GitHub', 'Gitee']),
  entityType: z.enum(['Repo', 'User']),
  owner: z.string().optional(),
  repo: z.string().optional(),
  login: z.string().optional(),
  metricName: z.enum(['openrank', 'stars', 'forks', 'contributors', 'participants']),
  timeRange: z.enum(['6m', '1y', '2y', '3y']).optional().describe('Time range for trend analysis')
});

const ecosystemInsightsSchema = z.object({
  platform: z.enum(['GitHub', 'Gitee']),
  category: z.enum(['language', 'topic', 'organization']).describe('Type of ecosystem analysis'),
  value: z.string().describe('Language name, topic, or organization to analyze'),
  limit: z.number().optional().describe('Number of top results to return (default: 10)')
});

const healthCheckSchema = z.object({
  includeCache: z.boolean().optional().describe('Include cache statistics in response'),
  includePerfMetrics: z.boolean().optional().describe('Include performance metrics')
});


// Tools list
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_open_digger_metric',
      description: 'Get single metric data from OpenDigger with enhanced error handling',
      inputSchema: zodToJsonSchema(inputSchema),
    },
    {
      name: 'get_open_digger_metrics_batch',
      description: 'Batch fetch multiple OpenDigger metrics with intelligent processing',
      inputSchema: zodToJsonSchema(batchInputSchema),
    },
    {
      name: 'compare_repositories',
      description: 'Compare multiple repositories across key metrics with intelligent analysis',
      inputSchema: zodToJsonSchema(compareReposSchema),
    },
    {
      name: 'analyze_trends',
      description: 'Perform comprehensive trend analysis on metrics over time',
      inputSchema: zodToJsonSchema(trendAnalysisSchema),
    },
    {
      name: 'get_ecosystem_insights',
      description: 'Get ecosystem-level insights for languages, topics, or organizations',
      inputSchema: zodToJsonSchema(ecosystemInsightsSchema),
    },
    {
      name: 'server_health',
      description: 'Get server health status, cache statistics, and performance metrics',
      inputSchema: zodToJsonSchema(healthCheckSchema),
    }
  ],
}));


server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    switch (request.params.name) {
      case 'get_open_digger_metric': {
        const args = inputSchema.parse(request.params.arguments);
        const url = buildUrl(args);
        const data = await fetchWithCache(url, DEFAULT_TTL_SECONDS);
        
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify({
              data,
              metadata: {
                metric: args.metricName,
                entity: `${args.owner || args.login}${args.repo ? '/' + args.repo : ''}`,
                platform: args.platform,
                timestamp: new Date().toISOString(),
                cached: true // Will be determined by fetchWithCache
              }
            }, null, 2) 
          }] 
        };
      }

      case 'get_open_digger_metrics_batch': {
        const args = batchInputSchema.parse(request.params.arguments);
        const results = [];
        
        // Process in batches to respect API limits
        for (let i = 0; i < args.requests.length; i += BATCH_SIZE) {
          // Add delay between batches to avoid rate limits (except first batch)
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          const chunk = args.requests.slice(i, i + BATCH_SIZE);
          const chunkResults = await Promise.all(chunk.map(async (r: z.infer<typeof inputSchema>) => {
            try {
              const url = buildUrl(r);
              const data = await fetchWithCache(url, DEFAULT_TTL_SECONDS);
              return { ok: true, request: r, data };
            } catch (err) {
              return { ok: false, request: r, error: (err as Error).message };
            }
          }));
          
          results.push(...chunkResults);
        }

        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify({ 
              results,
              summary: {
                total: args.requests.length,
                successful: results.filter(r => r.ok).length,
                failed: results.filter(r => !r.ok).length,
                processingTime: Date.now()
              }
            }, null, 2) 
          }] 
        };
      }

      case 'compare_repositories': {
        const args = compareReposSchema.parse(request.params.arguments);
        const metrics = args.metrics || ['openrank', 'stars', 'contributors'];
        
        const results = await Promise.all(
          args.repositories.map(async (repo) => {
            const repoMetrics = await Promise.all(
              metrics.map(async (metric) => {
                try {
                  const url = buildUrl({
                    platform: repo.platform,
                    entityType: 'Repo',
                    owner: repo.owner,
                    repo: repo.repo,
                    metricName: metric
                  });
                  const data = await fetchWithCache(url, DEFAULT_TTL_SECONDS);
                  return { metric, data, success: true };
                } catch (error) {
                  return { 
                    metric, 
                    error: (error as Error).message, 
                    success: false 
                  };
                }
              })
            );
            
            return {
              repository: `${repo.owner}/${repo.repo}`,
              platform: repo.platform,
              metrics: repoMetrics
            };
          })
        );

        const analysis = generateComparisonAnalysis(results, metrics);
        
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify({ 
              comparison: results, 
              analysis,
              metadata: {
                repositoryCount: args.repositories.length,
                metricsCompared: metrics,
                timestamp: new Date().toISOString()
              }
            }, null, 2) 
          }] 
        };
      }

      case 'analyze_trends': {
        const args = trendAnalysisSchema.parse(request.params.arguments);
        const url = buildUrl(args);
        const data = await fetchWithCache(url, DEFAULT_TTL_SECONDS);
        
        const trendAnalysis = processTrendData(data, args.timeRange || '1y');
        
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify({
              rawData: data,
              trendAnalysis,
              metadata: {
                metric: args.metricName,
                entity: `${args.owner || args.login}${args.repo ? '/' + args.repo : ''}`,
                timeRange: args.timeRange || '1y',
                platform: args.platform,
                timestamp: new Date().toISOString()
              }
            }, null, 2) 
          }] 
        };
      }

      case 'get_ecosystem_insights': {
        const args = ecosystemInsightsSchema.parse(request.params.arguments);
        
        // TODO: For now I've kept a placeholder for ecosystem insights - would need specialized endpoints
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: "ecosystem_insights_placeholder",
              message: "Ecosystem insights feature requires specialized OpenDigger endpoints",
              category: args.category,
              value: args.value,
              platform: args.platform,
              limit: args.limit || 10,
              suggestion: "Use compare_repositories for multi-repo analysis",
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }

      case 'server_health': {
        const args = healthCheckSchema.parse(request.params.arguments);
        const health: any = {
          status: 'healthy',
          version: VERSION,
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          memory: process.memoryUsage()
        };

        if (args.includeCache) {
          health.cache = getCacheStats();
        }

        if (args.includePerfMetrics) {
          health.performance = {
            eventLoopDelay: process.hrtime(),
            cpuUsage: process.cpuUsage()
          };
        }

        // Clean expired cache entries
        clearExpiredCache();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(health, null, 2)
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return { 
        content: [{ 
          type: 'text', 
          text: JSON.stringify({ 
            error: 'Invalid input parameters',
            details: error.errors,
            suggestions: generateErrorSuggestions('validation_error'),
            timestamp: new Date().toISOString()
          }, null, 2) 
        }] 
      };
    }
    
    const message = error instanceof Error ? error.message : String(error);
    return { 
      content: [{ 
        type: 'text', 
        text: JSON.stringify({ 
          error: message,
          context: {
            tool: request.params.name,
            arguments: request.params.arguments
          },
          suggestions: generateErrorSuggestions(message),
          timestamp: new Date().toISOString()
        }, null, 2) 
      }] 
    };
  }
});



// Prompts ...
// TODO: We can update and enhance the prompts further based on feedback  |  cc: @birdflyi, @frank-zsy
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: 'repo_health_analysis',
      description: 'Comprehensive repository health analysis with visualizations and actionable insights',
      arguments: [
        { name: 'platform', description: 'Platform (GitHub/Gitee)', required: true },
        { name: 'owner', description: 'Repository owner', required: true },
        { name: 'repo', description: 'Repository name', required: true },
        { name: 'timeframe', description: 'Analysis timeframe (monthly/quarterly/yearly)', required: false }
      ]
    },
    {
      name: 'repo_comparison',
      description: 'Side-by-side comparison of multiple repositories with competitive analysis',
      arguments: [
        { name: 'repositories', description: 'JSON array of repos: [{"platform":"GitHub","owner":"user","repo":"name"}]', required: true },
        { name: 'metrics', description: 'Comma-separated metrics to compare (default: openrank,stars,contributors)', required: false }
      ]
    },
    {
      name: 'developer_insights',
      description: 'Analyze developer activity patterns and contribution insights',
      arguments: [
        { name: 'platform', description: 'Platform (GitHub/Gitee)', required: true },
        { name: 'login', description: 'Developer username', required: true },
        { name: 'analysis_type', description: 'Type: activity, influence, or comprehensive', required: false }
      ]
    }
  ]
}));

server.setRequestHandler(GetPromptRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'repo_health_analysis': {
      const { platform, owner, repo, timeframe = 'auto' } = args || {};
      
      // TODO: We need to finetune the `VISUALIZATION REQUIREMENTS` section further based on feedback  |  cc: @birdflyi, @frank-zsy
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Analyze the health and activity of ${owner}/${repo} on ${platform}.

            ANALYSIS REQUIREMENTS:
              1. Use the compare_repositories and analyze_trends tools to fetch comprehensive data
              2. Fetch metrics: openrank, stars, forks, contributors, participants, issues_new, pull_requests, commits
              3. Determine timeframe: ${timeframe === 'auto' ? 'auto-detect based on repo age (>3y: yearly, >1y: quarterly, else: monthly)' : timeframe}
              4. Calculate health scores and identify trends

            OUTPUT FORMAT:
              Create a beautiful HTML report with:
                - Executive summary with key findings and health score
                - Repository health indicators with color coding (green/yellow/red)
                - Comparative analysis against similar projects in the ecosystem
                - Developer activity patterns and contribution insights  
                - Recent activity highlights and momentum analysis
                - Actionable recommendations for maintainers

              VISUALIZATION REQUIREMENTS:
                - Responsive HTML that works on desktop and mobile
                - Bar charts for comparative analysis
                - Radar chart for overall health assessment
                - Progress indicators for health scores
                - Export-friendly styling (print/PDF ready)

              HEALTH METRICS TO CALCULATE:
                - Community engagement score (based on participants, contributors)
                - Project momentum (based on recent activity trends)
                - Maintenance health (based on issue resolution, PR acceptance)
                - Popularity index (stars, forks growth rate)
                - Developer satisfaction (contributor retention, activity patterns)

            Make the analysis practical and actionable for repository maintainers and potential contributors.`
          }
        }]
      };
    }

    case 'repo_comparison': {
      const { repositories, metrics = 'openrank,stars,contributors,forks' } = args || {};
      
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Compare multiple repositories side-by-side with competitive analysis.

            REPOSITORIES TO ANALYZE: ${repositories}
            METRICS TO COMPARE: ${metrics}

            ANALYSIS STEPS:
              1. Use compare_repositories tool to fetch data for all repositories
              2. Use analyze_trends tool for each repository to understand growth patterns
              3. Calculate normalized scores for fair comparison across different scales
              4. Identify market leaders and growth champions in each category
              5. Generate strategic insights and recommendations

            OUTPUT FORMAT:
              Create an interactive HTML dashboard with:
                - Executive summary table with rankings and key insights
                - Side-by-side metric comparison with visual indicators
                - Growth trajectory analysis with trend lines
                - Market positioning matrix (performance vs growth)
                - Competitive gap analysis and opportunities
                - Strategic recommendations for each repository

            ANALYSIS DIMENSIONS:
              - Current Performance: Latest metric values and rankings
              - Growth Momentum: Recent trend analysis and acceleration
              - Community Health: Developer engagement and activity patterns
              - Market Position: Competitive standing and differentiation
              - Future Potential: Growth projections and opportunity areas

            INSIGHTS TO PROVIDE:
              - Who leads in each metric and why
              - Growth momentum leaders vs performance leaders
              - Community engagement comparison (developer satisfaction)
              - Market opportunities and competitive gaps
              - Strategic recommendations for improvement
              - Potential collaboration or learning opportunities

            Make this useful for strategic decision-making and competitive positioning.`
          }
        }]
      };
    }

    case 'developer_insights': {
      const { platform, login, analysis_type = 'comprehensive' } = args || {};
      

      // TODO: Update the prompt further based on feedback  |  cc: @birdflyi, @frank-zsy
      // Also, we need to update it to support visualization requirements
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Analyze developer ${login} on ${platform} platform.

            ANALYSIS TYPE: ${analysis_type}
            ANALYSIS FOCUS: ${analysis_type === 'activity' ? 'Activity patterns and productivity' : 
                            analysis_type === 'influence' ? 'Community influence and impact' : 
                            'Comprehensive developer profile'}

            DATA COLLECTION:
              1. Use get_open_digger_metric for developer-specific metrics
              2. Use analyze_trends to understand activity patterns over time
              3. Gather metrics: openrank, activity, contributions, influence patterns

            OUTPUT FORMAT:
              Generate a professional developer profile report with:
                - Developer summary with key achievements and influence score
                - Activity timeline showing contribution patterns over time
                - Skills and expertise analysis based on project involvement
                - Community impact metrics and influence assessment
                - Activity heatmap showing when and how they contribute
                - Collaboration network analysis (if available)
                - Career development insights and growth recommendations

            INSIGHTS TO PROVIDE:
              - Peak activity times and productivity patterns
              - Expertise areas and technical strengths
              - Community influence and leadership indicators
              - Collaboration style and team interaction patterns
              - Career development trajectory and growth areas
              - Recommendations for skill development and community engagement

            CAREER DEVELOPMENT FOCUS:
              - Identify areas of expertise and influence
              - Suggest opportunities for increased impact
              - Highlight collaboration and leadership potential
              - Provide actionable recommendations for professional growth

            Make this valuable for career development, team building, and understanding developer contributions to the open source ecosystem.`
          }
        }]
      };
    }

    default:
      throw new Error(`Prompt '${name}' not implemented`);
  }
});


async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // console.error("OpenDigger MCP Server running (on stdio)...");
  console.log("OpenDigger MCP Server running (on stdio)...");

  const ssePortEnv = process.env.SSE_PORT;
  if (ssePortEnv) {
    const ssePort = Number(ssePortEnv);
    const sseHost = process.env.SSE_HOST || '0.0.0.0';

    const serverHttp = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        if (!req.url) {
          res.statusCode = 400;
          res.end('Bad Request');
          return;
        }
        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        const pathname = urlObj.pathname;

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (pathname === '/health') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ 
            status: 'ok', 
            version: VERSION,
            uptime: process.uptime(),
            cache: getCacheStats()
          }));
          return;
        }

        function startSse() {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
          });
          res.write(`event: start\n`);
          res.write(`data: {"status":"connected","timestamp":"${new Date().toISOString()}"}\n\n`);
        }

        function sendEvent(event: string, data: unknown) {
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        }

        function endSse() {
          res.write(`event: end\n`);
          res.write(`data: {"status":"completed","timestamp":"${new Date().toISOString()}"}\n\n`);
          res.end();
        }

        if (pathname === '/sse') {
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }
          startSse();
          try {
            const query = urlObj.searchParams;
            const singleArgs = inputSchema.parse({
              platform: query.get('platform'),
              entityType: query.get('entityType'),
              owner: query.get('owner') || undefined,
              repo: query.get('repo') || undefined,
              login: query.get('login') || undefined,
              metricName: query.get('metricName'),
            });
            const url = buildUrl(singleArgs);
            const data = await fetchWithCache(url, DEFAULT_TTL_SECONDS);
            sendEvent('data', { request: singleArgs, data });
            endSse();
          } catch (err) {
            sendEvent('error', { error: (err as Error).message });
            endSse();
          }
          return;
        }

        if (pathname === '/sse/batch') {
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.end('Method Not Allowed!');
            return;
          }
          startSse();
          try {
            const raw = urlObj.searchParams.get('requests');
            if (!raw) throw new Error('Missing requests query param!');
            let parsed: unknown;
            try {
              parsed = JSON.parse(raw);
            } catch {
              throw new Error('Invalid JSON in requests param!');
            }
            const args = batchInputSchema.parse({ requests: parsed });
            
            sendEvent('progress', { total: args.requests.length, processed: 0 });
            
            for (let i = 0; i < args.requests.length; i++) {
              const r = args.requests[i]!;
              try {
                const url = buildUrl(r);
                const data = await fetchWithCache(url, DEFAULT_TTL_SECONDS);
                sendEvent('data', { index: i, ok: true, request: r, data });
              } catch (e) {
                sendEvent('data', { index: i, ok: false, request: r, error: (e as Error).message });
              }
              sendEvent('progress', { total: args.requests.length, processed: i + 1 });
            }
            endSse();
          } catch (err) {
            sendEvent('error', { error: (err as Error).message });
            endSse();
          }
          return;
        }

        res.statusCode = 404;
        res.end('Not Found');
      } catch (e) {
        try {
          res.statusCode = 500;
          res.end('Internal Server Error!');
        } catch {
          // ignore
        }
      }
    });

    serverHttp.listen(ssePort, sseHost, () => {
      console.log(`SSE HTTP server listening on http://${sseHost}:${ssePort}`);
    });
  }
}

main().catch((error) => {
  console.log("Fatal error in main():", error);
  process.exit(1);
});