import { describe, it, expect } from 'vitest';
import { parseListPartsResponse, parseS3ErrorCode } from '../src/services/r2/list-parts-xml';

const fixtures = {
  'empty.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>test-bucket</Bucket>
  <Key>test-key</Key>
  <UploadId>U1</UploadId>
  <PartNumberMarker>0</PartNumberMarker>
  <MaxParts>1000</MaxParts>
  <IsTruncated>false</IsTruncated>
</ListPartsResult>`,
  'single-part.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>test-bucket</Bucket>
  <Key>test-key</Key>
  <UploadId>U1</UploadId>
  <PartNumberMarker>0</PartNumberMarker>
  <MaxParts>1000</MaxParts>
  <IsTruncated>false</IsTruncated>
  <Part>
    <PartNumber>1</PartNumber>
    <LastModified>2026-05-01T12:00:00.000Z</LastModified>
    <ETag>"d41d8cd98f00b204e9800998ecf8427e"</ETag>
    <Size>5242880</Size>
  </Part>
</ListPartsResult>`,
  'single-page.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>test-bucket</Bucket>
  <Key>test-key</Key>
  <UploadId>U1</UploadId>
  <PartNumberMarker>0</PartNumberMarker>
  <MaxParts>1000</MaxParts>
  <IsTruncated>false</IsTruncated>
  <Part>
    <PartNumber>1</PartNumber>
    <LastModified>2026-05-01T12:00:00.000Z</LastModified>
    <ETag>"a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"</ETag>
    <Size>5242880</Size>
  </Part>
  <Part>
    <PartNumber>2</PartNumber>
    <LastModified>2026-05-01T12:00:01.000Z</LastModified>
    <ETag>"b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2"</ETag>
    <Size>5242880</Size>
  </Part>
  <Part>
    <PartNumber>3</PartNumber>
    <LastModified>2026-05-01T12:00:02.000Z</LastModified>
    <ETag>"c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"</ETag>
    <Size>1048576</Size>
  </Part>
</ListPartsResult>`,
  'truncated.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>test-bucket</Bucket>
  <Key>test-key</Key>
  <UploadId>U1</UploadId>
  <PartNumberMarker>0</PartNumberMarker>
  <NextPartNumberMarker>1</NextPartNumberMarker>
  <MaxParts>1</MaxParts>
  <IsTruncated>true</IsTruncated>
  <Part>
    <PartNumber>1</PartNumber>
    <LastModified>2026-05-01T12:00:00.000Z</LastModified>
    <ETag>"a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"</ETag>
    <Size>5242880</Size>
  </Part>
</ListPartsResult>`,
  'malformed.xml': `<this is not xml at all`,
  's3-error.xml': `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>NoSuchUpload</Code>
  <Message>The specified multipart upload does not exist.</Message>
  <UploadId>U1</UploadId>
  <RequestId>req-1</RequestId>
  <HostId>host-1</HostId>
</Error>`,
} as const;

const getFixture = (name: keyof typeof fixtures) => fixtures[name];

describe('parseListPartsResponse', () => {
  it('parses empty response', () => {
    const result = parseListPartsResponse(getFixture('empty.xml'));
    expect(result.parts).toEqual([]);
    expect(result.isTruncated).toBe(false);
    expect(result.nextPartNumberMarker).toBeUndefined();
  });

  it('parses single-part response (verifies isArray config)', () => {
    const result = parseListPartsResponse(getFixture('single-part.xml'));
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toEqual({
      PartNumber: 1,
      ETag: '"d41d8cd98f00b204e9800998ecf8427e"',
      Size: 5242880,
    });
    expect(result.isTruncated).toBe(false);
  });

  it('preserves quoted ETags', () => {
    const result = parseListPartsResponse(getFixture('single-page.xml'));
    expect(result.parts[0]!.ETag).toMatch(/^\".+\"$/);
    expect(result.parts[0]!.ETag).toBe('"a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"');
  });

  it('parses single page with multiple parts', () => {
    const result = parseListPartsResponse(getFixture('single-page.xml'));
    expect(result.parts).toHaveLength(3);
    expect(result.parts.map((p) => p.PartNumber)).toEqual([1, 2, 3]);
    expect(result.isTruncated).toBe(false);
    expect(result.nextPartNumberMarker).toBeUndefined();
  });

  it('parses truncated response with NextPartNumberMarker', () => {
    const result = parseListPartsResponse(getFixture('truncated.xml'));
    expect(result.isTruncated).toBe(true);
    expect(result.nextPartNumberMarker).toBe('1');
    expect(result.parts).toHaveLength(1);
  });

  it('throws on malformed XML', () => {
    const xml = getFixture('malformed.xml');
    expect(() => parseListPartsResponse(xml)).toThrow();
  });

  it('throws on S3 error response (no <ListPartsResult>)', () => {
    const xml = getFixture('s3-error.xml');
    expect(() => parseListPartsResponse(xml)).toThrow(
      /Invalid ListParts response/
    );
  });
});

describe('parseS3ErrorCode', () => {
  it('extracts <Code> from S3 error XML', () => {
    expect(parseS3ErrorCode(getFixture('s3-error.xml'))).toBe('NoSuchUpload');
  });

  it('returns null for non-error XML', () => {
    expect(parseS3ErrorCode(getFixture('empty.xml'))).toBeNull();
  });

  it('returns null for malformed XML', () => {
    expect(parseS3ErrorCode(getFixture('malformed.xml'))).toBeNull();
  });
});
