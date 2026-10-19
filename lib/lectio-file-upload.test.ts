import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LectioUploadError,
  sanitizeLectioUploadFilename,
  uploadDocumentToLectio,
} from './lectio-file-upload';

describe('sanitizeLectioUploadFilename', () => {
  it('replaces characters Lectio rejects while preserving the extension', () => {
    assert.equal(
      sanitizeLectioUploadFilename('Analytical essay "Words"?.docx'),
      'Analytical essay _Words__.docx',
    );
  });

  it('removes trailing dots and spaces', () => {
    assert.equal(sanitizeLectioUploadFilename('report. .pdf'), 'report.pdf');
  });

  it('provides a safe fallback name', () => {
    assert.equal(sanitizeLectioUploadFilename('???'), '___');
  });

  it('limits long names without dropping the extension', () => {
    const result = sanitizeLectioUploadFilename(`${'a'.repeat(250)}.docx`);
    assert.equal(result.length, 180);
    assert.ok(result.endsWith('.docx'));
  });

  it('uploads with the sanitized multipart filename', async () => {
    const originalWindow = globalThis.window;
    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'https://www.lectio.dk' } },
      configurable: true,
    });
    let uploadedName = '';
    globalThis.fetch = (async (_input, init) => {
      const uploaded = (init?.body as FormData).get('file') as File;
      uploadedName = uploaded.name;
      return new Response(JSON.stringify({ serializedId: 'document-123' }), { status: 200 });
    }) as typeof fetch;

    try {
      const result = await uploadDocumentToLectio(
        new File(['document'], 'Essay "final"?.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
        '21',
      );
      assert.equal(result.serializedId, 'document-123');
      assert.equal(uploadedName, 'Essay _final__.docx');
      assert.equal(result.filenameWasSanitized, true);
    } finally {
      globalThis.fetch = originalFetch;
      Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
    }
  });

  it('surfaces Lectio upload status failures', async () => {
    const originalWindow = globalThis.window;
    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'https://www.lectio.dk' } },
      configurable: true,
    });
    globalThis.fetch = (async () => new Response('Bad Request', { status: 400 })) as typeof fetch;

    try {
      await assert.rejects(
        uploadDocumentToLectio(new File(['x'], 'valid.pdf'), '21'),
        /HTTP 400/,
      );
    } finally {
      globalThis.fetch = originalFetch;
      Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
    }
  });

  async function rejectionFor(response: Response, file = new File(['x'], 'valid.pdf', { type: 'application/pdf' })) {
    const originalWindow = globalThis.window;
    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'https://www.lectio.dk' } },
      configurable: true,
    });
    globalThis.fetch = (async () => response) as typeof fetch;
    try {
      await uploadDocumentToLectio(file, '21');
    } catch (err) {
      assert.ok(err instanceof LectioUploadError);
      return err;
    } finally {
      globalThis.fetch = originalFetch;
      Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
    }
    assert.fail('upload did not reject');
  }

  function redirectedResponse(body: string, url: string, contentType: string): Response {
    const response = new Response(body, { status: 200, headers: { 'content-type': contentType } });
    Object.defineProperty(response, 'redirected', { value: true });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  }

  it('classifies a redirect to the login page as an expired session', async () => {
    const err = await rejectionFor(redirectedResponse(
      '<html><body>Log ind</body></html>',
      'https://www.lectio.dk/lectio/21/login.aspx?prevurl=dokumentupload.aspx',
      'text/html; charset=utf-8',
    ));
    assert.equal(err.code, 'session_expired');
    assert.equal(err.telemetry.redirected, true);
    assert.equal(err.telemetry.content_type, 'text/html');
  });

  it('classifies a rendered login form as an expired session', async () => {
    const err = await rejectionFor(new Response(
      '<form method="post" action="./login.aspx?prevurl=x" id="aspnetForm"></form>',
      { status: 200, headers: { 'content-type': 'text/html' } },
    ));
    assert.equal(err.code, 'session_expired');
  });

  it('classifies an HTML page as a Lectio rejection', async () => {
    const err = await rejectionFor(new Response(
      '<!DOCTYPE html><html><body>Fejl</body></html>',
      { status: 200, headers: { 'content-type': 'text/html' } },
    ));
    assert.equal(err.code, 'lectio_rejected');
  });

  it('classifies an empty body', async () => {
    const err = await rejectionFor(new Response('', { status: 200 }));
    assert.equal(err.code, 'empty_response');
    assert.equal(err.telemetry.body_length, 0);
  });

  it('classifies JSON without serializedId as unparseable', async () => {
    const err = await rejectionFor(new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    assert.equal(err.code, 'unparseable_response');
  });

  it('keeps upload telemetry free of the body, URL and filename', async () => {
    const err = await rejectionFor(
      redirectedResponse('<html>secret</html>', 'https://www.lectio.dk/lectio/21/fejl.aspx?id=1', 'text/html'),
      new File(['x'.repeat(200_000)], 'private-name.pdf', { type: 'application/pdf' }),
    );
    assert.deepEqual(err.telemetry, {
      failure_code: 'lectio_rejected',
      content_type: 'text/html',
      body_length: 19,
      redirected: true,
      file_mime_type: 'application/pdf',
      file_size_bucket: '100KB-1MB',
    });
  });
});
