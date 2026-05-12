import { marked } from 'marked';

// Configure marked once. Raw HTML is disabled (use the renderer's default text escaping)
// and breaks are on so single newlines in prose render as <br>, which matches how people
// write in textareas.
marked.setOptions({
  gfm: true,
  breaks: true
});

export function renderStory(text: string): string {
  if (!text) return '';
  return marked.parse(text, { async: false }) as string;
}
