const UNSAFE_FILENAME_CHARS = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;
const MAX_UPLOAD_FILENAME_LENGTH = 180;

export type LectioUploadFailureCode =
  | 'http_error'
  | 'session_expired'
  | 'lectio_rejected'
  | 'empty_response'
  | 'unparseable_response';

/**
 * An upload that Lectio did not accept. `telemetry` holds metadata only:
 * never the response body, URL, or filename.
 */
export class LectioUploadError extends Error {
  constructor(
    message: string,
    readonly code: LectioUploadFailureCode,
    readonly telemetry: Record<string, string | number | boolean>,
  ) {
    super(message);
    this.name = 'LectioUploadError';
  }
}

export interface LectioUploadResult {
  serializedId: string;
  uploadedFilename: string;
  filenameWasSanitized: boolean;
}

/**
 * Lectio rejects multipart uploads whose filename contains characters such as
 * quotes or question marks. Keep the extension intact and only replace the
 * unsafe filename characters; the file contents and MIME type are untouched.
 */
export function sanitizeLectioUploadFilename(filename: string): string {
  const normalized = filename.normalize('NFC').trim();
  const lastDot = normalized.lastIndexOf('.');
  const hasExtension = lastDot > 0 && lastDot < normalized.length - 1;
  const rawStem = hasExtension ? normalized.slice(0, lastDot) : normalized;
  const rawExtension = hasExtension ? normalized.slice(lastDot + 1) : '';
  const extension = rawExtension.replace(UNSAFE_FILENAME_CHARS, '_').replace(/[. ]+$/g, '');
  const suffix = extension ? `.${extension}` : '';
  const maxStemLength = Math.max(1, MAX_UPLOAD_FILENAME_LENGTH - suffix.length);
  const stem = rawStem
    .replace(UNSAFE_FILENAME_CHARS, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, maxStemLength)
    .replace(/[. ]+$/g, '') || 'upload';
  return `${stem}${suffix}`;
}

function fileSizeBucket(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) return '<100KB';
  if (mb < 1) return '100KB-1MB';
  if (mb < 10) return '1-10MB';
  if (mb < 50) return '10-50MB';
  return '>=50MB';
}

function isLoginUrl(url: string): boolean {
  try {
    return /\/login\.aspx$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function classifyUploadFailure(
  response: Response,
  body: string,
): { code: LectioUploadFailureCode; message: string } {
  const trimmed = body.trim();
  const contentType = response.headers.get('content-type') || '';
  if (
    isLoginUrl(response.url)
    || /<form[^>]+action=["'][^"']*login\.aspx/i.test(trimmed)
  ) {
    return { code: 'session_expired', message: 'Lectio session expired during file upload' };
  }
  if (!trimmed) {
    return { code: 'empty_response', message: 'Lectio returned an empty upload response' };
  }
  if (/text\/html/i.test(contentType) || /^<(?:!doctype|html)/i.test(trimmed)) {
    return { code: 'lectio_rejected', message: 'Lectio rejected the file upload' };
  }
  return { code: 'unparseable_response', message: 'Could not parse upload response' };
}

export async function uploadDocumentToLectio(
  file: File,
  schoolId: string,
): Promise<LectioUploadResult> {
  const uploadUrl = new URL(
    `/lectio/${schoolId}/dokumentupload.aspx`,
    window.location.origin,
  ).href;
  const uploadedFilename = sanitizeLectioUploadFilename(file.name);
  const uploadFile = uploadedFilename === file.name
    ? file
    : new File([file], uploadedFilename, {
        type: file.type,
        lastModified: file.lastModified,
      });
  const formData = new FormData();
  formData.append('file', uploadFile);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  const fileTelemetry = {
    file_mime_type: file.type || 'unknown',
    file_size_bucket: fileSizeBucket(file.size),
  };
  if (!response.ok) {
    throw new LectioUploadError(
      `File upload failed with HTTP ${response.status}`,
      'http_error',
      { failure_code: 'http_error', http_status: response.status, ...fileTelemetry },
    );
  }

  const body = await response.text();
  let serializedId = '';
  try {
    serializedId = JSON.parse(body)?.serializedId || '';
  } catch {
    const match = body.match(/serializedId['":\s]+['"]([^'"]+)['"]/);
    serializedId = match?.[1] || '';
  }
  if (!serializedId) {
    const { code, message } = classifyUploadFailure(response, body);
    throw new LectioUploadError(message, code, {
      failure_code: code,
      content_type: (response.headers.get('content-type') || 'none').split(';')[0].trim().toLowerCase(),
      body_length: body.length,
      redirected: response.redirected,
      ...fileTelemetry,
    });
  }

  return {
    serializedId,
    uploadedFilename,
    filenameWasSanitized: uploadedFilename !== file.name,
  };
}
