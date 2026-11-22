import { ParseError, type ParseResult } from '../data_model/track';
import { parseCsvText } from './csv';
import { parseMergedCsvTexts, type NamedCsv } from './merge';

export type WorkerRequest = NamedCsv[];

export type WorkerResponse =
  | { ok: true; result: ParseResult }
  | { ok: false; message: string; isParseError: boolean };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  let response: WorkerResponse;
  try {
    const single = e.data.length === 1 ? (e.data[0] as NamedCsv) : null;
    response = { ok: true, result: single ? parseCsvText(single.text, single.name) : parseMergedCsvTexts(e.data) };
  } catch (err) {
    response = {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      isParseError: err instanceof ParseError,
    };
  }
  self.postMessage(response);
};