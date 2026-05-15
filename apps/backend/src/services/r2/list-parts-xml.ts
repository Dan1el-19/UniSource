import { XMLParser } from 'fast-xml-parser';

export interface ParsedListPartsResponse {
  isTruncated: boolean;
  nextPartNumberMarker: string | undefined;
  parts: Array<{ PartNumber: number; ETag: string; Size: number }>;
}

const listPartsParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  isArray: (name) => name === 'Part',
});

const errorParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
});

interface RawPart {
  PartNumber?: string;
  ETag?: string;
  Size?: string;
}

interface RawListPartsResult {
  IsTruncated?: string;
  NextPartNumberMarker?: string;
  Part?: RawPart[];
}

export function parseListPartsResponse(xml: string): ParsedListPartsResponse {
  let parsed: { ListPartsResult?: RawListPartsResult };
  try {
    parsed = listPartsParser.parse(xml) as { ListPartsResult?: RawListPartsResult };
  } catch (err) {
    throw new Error(
      `Invalid ListParts response: XML parse failed (${(err as Error).message})`
    );
  }

  const root = parsed.ListPartsResult;
  if (!root) {
    throw new Error('Invalid ListParts response: missing <ListPartsResult>');
  }

  const isTruncated = String(root.IsTruncated ?? '').toLowerCase() === 'true';
  const nextPartNumberMarker =
    typeof root.NextPartNumberMarker === 'string' && root.NextPartNumberMarker !== '0' && root.NextPartNumberMarker !== ''
      ? root.NextPartNumberMarker
      : undefined;

  const partsRaw: RawPart[] = root.Part ?? [];
  const parts = partsRaw.map((p) => ({
    PartNumber: Number(p.PartNumber),
    ETag: typeof p.ETag === 'string' ? p.ETag : '',
    Size: Number(p.Size ?? 0),
  }));

  return { isTruncated, nextPartNumberMarker, parts };
}

export function parseS3ErrorCode(xml: string): string | null {
  try {
    const parsed = errorParser.parse(xml) as { Error?: { Code?: string } };
    const code = parsed.Error?.Code;
    return typeof code === 'string' ? code : null;
  } catch {
    return null;
  }
}
