import { schema } from '@kbn/config-schema';
import { IRouter } from '../../../../src/core/server';

const SLA_INDEX = 'computed-sla-im-services*';

const CSV_COLUMNS = [
  'facilityId',
  'facilityCategory',
  'district',
  'block',
  'incidentType',
  'incidentSubType',
  'priority',
  'state',
  'currentOwner',
  'filedDate',
  'resolvedTimestamp',
  'slaRemaining',
  'totalSlaRemaining',
  'withinOverallSLA',
  'createdTime',
  'lastModifiedDate',
] as const;

type CsvRow = Record<(typeof CSV_COLUMNS)[number], string | number>;

function escapeCsvValue(value: string | number): string {
  const stringValue = String(value ?? '');
  if (/["\r\n,]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function toCsv(rows: CsvRow[]): string {
  const header = CSV_COLUMNS.join(',');
  const lines = rows.map((row) =>
    CSV_COLUMNS.map((column) => escapeCsvValue(row[column])).join(',')
  );
  // Excel only detects UTF-8 in a CSV when it starts with a byte order mark.
  return `﻿${[header, ...lines].join('\n')}`;
}

const PAGE_SIZE = 1000;

function isIndexNotFoundError(error: any): boolean {
  return error?.meta?.body?.error?.type === 'index_not_found_exception';
}

const SCROLL_KEEP_ALIVE = '1m';

// Scroll (not point-in-time) is deliberate: the initial scroll request is an ordinary
// search, so Elasticsearch silently narrows the index wildcard to the indices the
// current user is authorised for. Opening a PIT instead requires privileges on every
// index the wildcard resolves to, which fails for state-scoped roles.
async function fetchAllHits(
  esClient: any,
  index: string,
  query: Record<string, any>
): Promise<Array<Record<string, any>>> {
  const allHits: Array<Record<string, any>> = [];

  let result;
  try {
    result = await esClient.search<Record<string, any>>({
      index,
      size: PAGE_SIZE,
      query,
      scroll: SCROLL_KEEP_ALIVE,
      ignore_unavailable: true,
      sort: [{ _doc: 'asc' }],
    });
  } catch (error) {
    if (isIndexNotFoundError(error)) {
      return [];
    }
    throw error;
  }

  let scrollId: string | undefined = result._scroll_id;

  try {
    // `size` is per shard when scrolling, so a batch may hold more or fewer than
    // PAGE_SIZE hits. An empty batch is the only reliable end-of-scroll signal.
    while (result.hits.hits.length > 0) {
      allHits.push(...result.hits.hits);

      result = await esClient.scroll({
        scroll_id: scrollId,
        scroll: SCROLL_KEEP_ALIVE,
      });
      scrollId = result._scroll_id ?? scrollId;
    }
  } finally {
    if (scrollId) {
      try {
        await esClient.clearScroll({ scroll_id: scrollId });
      } catch (error) {
        // A scroll that already expired cannot be cleared; nothing to recover here.
      }
    }
  }

  return allHits;
}

export function defineRoutes(router: IRouter) {
  router.get(
    {
      path: '/api/full_export/test',
      validate: false,
    },
    async (context, request, response) => {
      return response.ok({
        body: {
          message: 'Full export plugin is working',
          authenticated: request.auth.isAuthenticated,
        },
      });
    }
  );

  router.get(
    {
      path: '/api/full_export/sla-filters',
      validate: {
        query: schema.object({
          state: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response) => {
      const esClient = (await context.core).elasticsearch.client.asCurrentUser;
      const { state } = request.query;

      const districtQuery = state
        ? { bool: { filter: [{ term: { 'Data.state.keyword': state } }] } }
        : { match_all: {} };

      try {
        const [stateAggResult, districtAggResult] = await Promise.all([
          esClient.search<unknown, { states: { buckets: Array<{ key: string }> } }>({
            index: SLA_INDEX,
            size: 0,
            ignore_unavailable: true,
            aggs: { states: { terms: { field: 'Data.state.keyword', size: 1000 } } },
          }),
          esClient.search<unknown, { districts: { buckets: Array<{ key: string }> } }>({
            index: SLA_INDEX,
            size: 0,
            ignore_unavailable: true,
            query: districtQuery,
            aggs: { districts: { terms: { field: 'Data.district.keyword', size: 1000 } } },
          }),
        ]);

        const states =
          stateAggResult.aggregations?.states.buckets.map((bucket) => bucket.key) ?? [];
        const districts =
          districtAggResult.aggregations?.districts.buckets.map((bucket) => bucket.key) ?? [];

        return response.ok({ body: { states, districts } });
      } catch (error) {
        if (isIndexNotFoundError(error)) {
          return response.ok({ body: { states: [], districts: [] } });
        }
        throw error;
      }
    }
  );

  router.get(
    {
      path: '/api/full_export/sla-report',
      validate: {
        query: schema.object({
          district: schema.maybe(schema.string()),
          block: schema.maybe(schema.string()),
          priority: schema.maybe(schema.string()),
          state: schema.maybe(schema.string()),
          fromDate: schema.maybe(schema.number()),
          toDate: schema.maybe(schema.number()),
        }),
      },
    },
    async (context, request, response) => {
      const esClient = (await context.core).elasticsearch.client.asCurrentUser;
      const { district, block, priority, state, fromDate, toDate } = request.query;

      const filters: Record<string, any>[] = [];
      if (district) filters.push({ term: { 'Data.district.keyword': district } });
      if (block) filters.push({ term: { 'Data.block.keyword': block } });
      if (priority) filters.push({ term: { 'Data.priority.keyword': priority } });
      if (state) filters.push({ term: { 'Data.state.keyword': state } });
      if (fromDate || toDate) {
        filters.push({
          range: {
            'Data.filedDate': {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          },
        });
      }

      const query = filters.length ? { bool: { filter: filters } } : { match_all: {} };

      let hits: Array<Record<string, any>>;
      try {
        hits = await fetchAllHits(esClient, SLA_INDEX, query);
      } catch (error) {
        return response.customError({
          statusCode: error?.meta?.statusCode || 500,
          body: { message: error?.message || 'Failed to fetch SLA report data' },
        });
      }

      const rows: CsvRow[] = hits.map((hit) => {
        const source = hit._source || {};
        const data = source.Data || {};
        const incident = data.incident || {};

        return {
          facilityId: data.facilityId ?? '',
          facilityCategory: data.facilityCategory ?? '',
          district: data.district ?? '',
          block: data.block ?? '',
          incidentType: incident.incidentType ?? '',
          incidentSubType: incident.incidentSubType ?? '',
          priority: data.priority ?? source.Priority ?? '',
          state: data.state ?? '',
          currentOwner: source.currentOwner ?? '',
          filedDate: data.filedDate ?? '',
          resolvedTimestamp: data.resolvedTimestamp ?? '',
          slaRemaining: data.slaRemaining ?? '',
          totalSlaRemaining: data.totalSlaRemaining ?? '',
          withinOverallSLA: source.withinOverallSLA ?? '',
          createdTime: source.createdTime ?? '',
          lastModifiedDate: source.lastModifiedDate ?? '',
        };
      });

      const csv = toCsv(rows);

      return response.ok({
        body: csv,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="sla-report.csv"',
        },
      });
    }
  );
}
