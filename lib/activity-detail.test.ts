import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DOMParser } from 'linkedom';
import { extractWebvisningUrl, sanitizeActivityHtml } from './activity-detail';

const BASE_URL = 'https://www.lectio.dk/lectio/94/aktivitet/aktivitetforside2.aspx?absid=1';

function fragment(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(`<main id="root">${html}</main>`, 'text/html');
  return doc.querySelector('#root') as unknown as HTMLElement;
}

describe('Webvisning links', () => {
  test('extracts only URLs from recognized viewer commands', () => {
    assert.equal(
      extractWebvisningUrl("window.open('/lectio/94/viewer.aspx?id=7', '_blank')", BASE_URL),
      'https://www.lectio.dk/lectio/94/viewer.aspx?id=7',
    );
    assert.equal(
      extractWebvisningUrl("Lectio.OpenWindow('https://files.example.test/view/7')", BASE_URL),
      'https://files.example.test/view/7',
    );
    assert.equal(extractWebvisningUrl("doSomething('/lectio/94/not-allowed')", BASE_URL), null);
    assert.equal(extractWebvisningUrl("window.open('javascript:alert(1)')", BASE_URL), null);
  });

  test('turns a placeholder Webvisning anchor into a safe normal link', () => {
    const root = fragment(`
      <a href="#" onclick="window.open('/lectio/94/viewer.aspx?id=7'); return false;">Webvisning</a>
    `);

    sanitizeActivityHtml(root, BASE_URL);
    const anchor = root.querySelector('a')!;
    assert.equal(anchor.getAttribute('href'), 'https://www.lectio.dk/lectio/94/viewer.aspx?id=7');
    assert.equal(anchor.getAttribute('onclick'), null);
    assert.equal(anchor.getAttribute('target'), '_blank');
    assert.equal(anchor.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(anchor.getAttribute('data-bl-webvisning'), 'true');
  });

  test('does not preserve an unsafe or unrecognized Webvisning action', () => {
    const root = fragment('<a href="#" onclick="runArbitraryCode()">Webvisning</a>');
    sanitizeActivityHtml(root, BASE_URL);
    const anchor = root.querySelector('a')!;
    assert.equal(anchor.getAttribute('href'), null);
    assert.equal(anchor.getAttribute('onclick'), null);
  });
});
