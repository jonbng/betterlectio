# Fag & Faggruppe in FindSkema

This documents how Fag (subjects) and Faggrupper (subject groups) were fetched and displayed in the FindSkema page. These filters were removed to simplify the extension, but this guide should make it straightforward to re-add them.

## Why it was removed

Fag/Faggruppe items can't be fetched from the same simple dropdown API that all other entity types use. They require a multi-step ASP.NET postback dance with `FindSkemaAdv.aspx`, which added complexity (extra content script, session state machine, multiple network requests on page load). The feature was cut to reduce surface area.

## How Lectio organizes entities

Lectio's "Find Skema" has two tiers of entities:

### Tier 1 — Dropdown API (simple)

Students, teachers, classes, rooms, resources, hold, and groups are all available from a single JSON endpoint:

```
/lectio/{schoolId}/cache/DropDown.aspx?type=AvanceretSkema&afdeling={afdelingId}&subcache={subcache}
```

This returns a JSON array where each item is `[title, key, flags, group, cssClass, _que, isContextCard, shortName, longName]`. The `key` field (e.g. `S12345`, `T678`, `SC42`, `HE99`) encodes the entity type via its prefix.

### Tier 2 — FindSkemaAdv postback (complex)

Fag and Faggrupper are **not** in the dropdown API. They live behind `FindSkemaAdv.aspx` (the "advanced schedule search" page) and are only accessible via ASP.NET postbacks.

## How Fag/Faggruppe fetching worked

### Step 1: Fetch the FindSkemaAdv page

```ts
const advUrl = new URL(`/lectio/${schoolId}/FindSkemaAdv.aspx`, window.location.origin);
const html = await fetch(advUrl.href, { credentials: 'include' }).then(r => r.text());
```

### Step 2: Extract ASP.NET form state

Parse the HTML with `DOMParser` and extract all hidden form fields from `#aspnetForm`:

```ts
function extractFormData(doc: Document): URLSearchParams {
  const form = doc.querySelector('form#aspnetForm');
  const params = new URLSearchParams();
  // iterate all input/select/textarea elements
  // skip submit/button/image/file/reset types
  // skip unchecked checkboxes/radios
  // append name=value for everything else
  return params;
}
```

This captures `__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`, and all other ASP.NET fields needed for a valid postback.

### Step 3: Fire a postback to open the chooser dialog

POST back to the same URL with `__EVENTTARGET` set to the "Change" button:

| Category   | `__EVENTTARGET` value            |
|------------|----------------------------------|
| Fag        | `m$Content$ChangeFagBtn`         |
| Faggruppe  | `m$Content$ChangeFaggruppeBtn`   |

```ts
formData.set('__EVENTTARGET', 'm$Content$ChangeFagBtn'); // or ChangeFaggruppeBtn
formData.set('__EVENTARGUMENT', '');

const responseHtml = await fetch(advUrl.href, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: formData.toString(),
}).then(r => r.text());
```

The response HTML contains the chooser dialog with a `<select multiple>` element.

### Step 4: Parse the options from the chooser

The chooser `<select>` has a known ID:

| Category   | Select element ID                     |
|------------|---------------------------------------|
| Fag        | `m_Content_FagMC_totalSet`            |
| Faggruppe  | `m_Content_FaggruppeMC_totalSet`      |

Each `<option>` looks like:

```html
<option value="F568">DA - Dansk</option>
<option value="F412">EN - Engelsk</option>
```

Parse them into search items:

```ts
const doc = new DOMParser().parseFromString(responseHtml, 'text/html');
const select = doc.getElementById('m_Content_FagMC_totalSet');
const items = [];
for (const option of select.querySelectorAll('option')) {
  items.push({
    name: option.textContent.trim(),  // "DA - Dansk"
    id: option.value.trim(),           // "F568"
    type: 'F',                         // 'F' for Fag, 'J' for Faggruppe
  });
}
```

### Important: Sequential fetching

Fag and Faggrupper must be fetched **sequentially**, not in parallel. Both postbacks operate on the same server-side ASP.NET session, and concurrent requests cause session serialization conflicts that can return incorrect or empty results.

```ts
// CORRECT - sequential
const fagItems = await fetchAdvancedCategoryItems(schoolId, 'fag');
const faggruppeItems = await fetchAdvancedCategoryItems(schoolId, 'faggruppe');

// WRONG - parallel (session conflicts)
const [fag, faggruppe] = await Promise.all([
  fetchAdvancedCategoryItems(schoolId, 'fag'),
  fetchAdvancedCategoryItems(schoolId, 'faggruppe'),
]);
```

## How "click to view schedule" worked

Unlike other entity types, Fag/Faggrupper don't have a direct `SkemaNy.aspx?...` URL. Viewing a Fag schedule requires a 3-step postback automation on `FindSkemaAdv.aspx`:

1. **Open the chooser** — POST with `__EVENTTARGET = ChangeFagBtn`
2. **Select the item and save** — Move the `<option>` from `totalSet` to `selectedSet`, then POST with `__EVENTTARGET = SaveButtonFag`
3. **Generate the schedule** — POST with `__EVENTTARGET = m$Content$NytSkemaBtn`

Each step triggers a full page reload. This was implemented as a **content script state machine** (`findskema-adv-auto.content.ts`) using `sessionStorage` to track progress across reloads:

```ts
// FindSkemaPage sets this when a Fag/Faggruppe card is clicked:
sessionStorage.setItem('bl-fag-auto', JSON.stringify({
  category: 'fag',      // or 'faggruppe'
  fagId: 'F568',         // the option value
  step: 'open-chooser',  // initial step
}));
// Then navigates to /lectio/{schoolId}/FindSkemaAdv.aspx

// The content script on FindSkemaAdv reads the state and:
// step 'open-chooser'      -> fires postback, advances to 'select-and-save'
// step 'select-and-save'   -> moves option, fires postback, advances to 'generate'
// step 'generate'          -> fires final postback, clears state
```

### ASP.NET postback helper

The content script runs in `MAIN` world (not isolated) so it can submit the real page form:

```ts
function doPostBack(eventTarget: string): void {
  const form = document.getElementById('aspnetForm') as HTMLFormElement;
  (document.getElementById('__EVENTTARGET') as HTMLInputElement).value = eventTarget;
  (document.getElementById('__EVENTARGUMENT') as HTMLInputElement).value = '';
  form.submit();
}
```

### Moving options between select elements

Lectio's chooser uses a dual-listbox pattern (`totalSet` and `selectedSet`). To "select" an item, you move its `<option>` from one `<select>` to the other and mark all options in `selectedSet` as `.selected = true`:

```ts
function moveOptionToSelectedSet(totalSetId, selectedSetId, fagId) {
  const totalSet = document.getElementById(totalSetId);
  const selectedSet = document.getElementById(selectedSetId);
  const option = totalSet.querySelector(`option[value="${CSS.escape(fagId)}"]`);
  totalSet.removeChild(option);
  selectedSet.appendChild(option);
  option.selected = true;
  for (const opt of selectedSet.options) opt.selected = true;
}
```

### Element IDs reference

| Category   | Change button              | Save button                       | totalSet ID                        | selectedSet ID                        |
|------------|----------------------------|-----------------------------------|------------------------------------|---------------------------------------|
| Fag        | `m$Content$ChangeFagBtn`   | `m$Content$SaveButtonFag`         | `m_Content_FagMC_totalSet`         | `m_Content_FagMC_selectedSet`         |
| Faggruppe  | `m$Content$ChangeFaggruppeBtn` | `m$Content$SaveButtonFaggruppe` | `m_Content_FaggruppeMC_totalSet`   | `m_Content_FaggruppeMC_selectedSet`   |

Generate schedule button: `m$Content$NytSkemaBtn`

## Type keys

Fag items used `'F'` as their type key and Faggrupper used `'J'`. The filter pills in FindSkemaPage used:

```ts
{ key: 'F', label: 'Fag', icon: BookOpen, type: 'fag' }
{ key: 'J', label: 'Faggrupper', icon: Shapes, type: 'faggruppe' }
```

PersonCard badge colors:

```ts
F: { label: 'Fag', badgeClass: 'bg-lime-100 text-lime-700 dark:bg-lime-900 dark:text-lime-300' }
J: { label: 'Faggruppe', badgeClass: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300' }
```

## Files that were involved

| File | Role |
|------|------|
| `lib/findskema-advanced.ts` | Fetched Fag/Faggruppe items via postback |
| `entrypoints/findskema-adv-auto.content.ts` | 3-step postback state machine for schedule generation |
| `lib/findskema-types.ts` | Type mapping (F/J prefixes) |
| `components/FindSkemaPage.tsx` | Filter config, data loading, click handler |
| `components/PersonCard.tsx` | Badge config for F/J types |

## Re-adding checklist

1. **Recreate `lib/findskema-advanced.ts`** with `fetchAdvancedCategoryItems()` (postback-based fetching as described above)
2. **Recreate `entrypoints/findskema-adv-auto.content.ts`** (content script state machine for schedule generation on `FindSkemaAdv.aspx`)
3. **In `lib/findskema-types.ts`**: Add `'F' | 'J'` back to `FindSkemaTypeKey` and add early-return checks for `id.startsWith('F')` / `id.startsWith('J')` in `getFindSkemaTypeKeyFromId()`
4. **In `components/FindSkemaPage.tsx`**:
   - Import `fetchAdvancedCategoryItems` and the `BookOpen`/`Shapes` icons
   - Add `'fag' | 'faggruppe'` back to `SearchType`
   - Add F/J entries to `FILTER_CONFIG`, `TYPE_TO_PREFIX`, and `ALL_FILTER_KEYS`
   - In `loadData()`, fetch advanced items after the dropdown and merge via a `Map` to deduplicate
   - In `handleCardClick()`, set `sessionStorage` state for Fag/Faggruppe items
5. **In `components/PersonCard.tsx`**: Add F/J entries back to `TYPE_CONFIG`
6. **Register the content script** in `wxt.config.ts` if WXT doesn't auto-discover it (it should, since it's in `entrypoints/`)
