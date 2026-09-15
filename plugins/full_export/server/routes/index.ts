import { schema } from '@kbn/config-schema';
import dateMath from '@kbn/datemath';
import { buildEsQuery } from '@kbn/es-query';
import { IRouter } from '../../../../src/core/server';

const SLA_INDEX = 'computed-sla-im-services*';

// The dashboard time picker filters on the data view's time field. `Data.@timestamp`
// is the only `date`-mapped field on this index, so it is what the range applies to.
const TIME_FIELD = 'Data.@timestamp';

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

// Translates the dashboard's own state - filter pills (which is what Controls emit),
// the KQL/Lucene bar and the time picker - into a single Elasticsearch query, so the
// export matches exactly what the dashboard is displaying.
function buildDashboardQuery({
  filters,
  query,
  timeRange,
}: {
  filters?: any[];
  query?: any;
  timeRange?: { from: string; to: string };
}): Record<string, any> {
  const esQuery = buildEsQuery(undefined, query ? [query] : [], filters ?? []);

  if (!timeRange) {
    return esQuery;
  }

  const from = dateMath.parse(timeRange.from);
  const to = dateMath.parse(timeRange.to, { roundUp: true });

  if (!from && !to) {
    return esQuery;
  }

  return {
    bool: {
      must: [esQuery],
      filter: [
        {
          range: {
            [TIME_FIELD]: {
              ...(from ? { gte: from.toISOString() } : {}),
              ...(to ? { lte: to.toISOString() } : {}),
              format: 'strict_date_optional_time',
            },
          },
        },
      ],
    },
  };
}

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

  router.post(
    {
      path: '/api/full_export/sla-report',
      validate: {
        // The dashboard's filter/query objects are Kibana-owned shapes that carry their
        // own DSL, so they are accepted as-is and normalised by buildEsQuery.
        body: schema.object({
          filters: schema.maybe(schema.arrayOf(schema.any())),
          query: schema.maybe(schema.any()),
          timeRange: schema.maybe(
            schema.object({
              from: schema.string(),
              to: schema.string(),
            })
          ),
        }),
      },
    },
    async (context, request, response) => {
      const esClient = (await context.core).elasticsearch.client.asCurrentUser;
      const query = buildDashboardQuery(request.body);

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
