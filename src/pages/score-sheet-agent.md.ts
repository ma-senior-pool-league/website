// Plain-text (Markdown) copy of the score-sheet agent instructions, for AI agents to fetch.
import instructions from '../../docs/SCORE_SHEET_AGENT.md?raw';

export function GET() {
  return new Response(instructions, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
