import { describe, expect, it } from "vitest";
import {
  accumulateTokensFromStream,
  parseGeminiStreamEvent,
  parseOpenAIStreamEvent,
} from "../src/services/providers";

describe("streaming token parsing", () => {
  it("parses OpenAI Responses API usage", () => {
    expect(parseOpenAIStreamEvent(JSON.stringify({
      usage: { input_tokens: 10, output_tokens: 5 },
    }))).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("parses nested OpenAI completion usage", () => {
    expect(parseOpenAIStreamEvent(JSON.stringify({
      type: "response.completed",
      response: { usage: { input_tokens: 12, output_tokens: 7 } },
    }))).toEqual({ inputTokens: 12, outputTokens: 7 });
  });

  it("supports OpenAI Chat Completions usage and zero-token values", () => {
    expect(parseOpenAIStreamEvent(JSON.stringify({
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    }))).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("returns no tokens for invalid or missing OpenAI usage", () => {
    expect(parseOpenAIStreamEvent("not json")).toEqual({});
    expect(parseOpenAIStreamEvent(JSON.stringify({ choices: [] }))).toEqual({
      inputTokens: undefined,
      outputTokens: undefined,
    });
  });

  it("parses Gemini usage metadata including zero-token values", () => {
    expect(parseGeminiStreamEvent(JSON.stringify({
      usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 8 },
    }))).toEqual({ inputTokens: 15, outputTokens: 8 });
    expect(parseGeminiStreamEvent(JSON.stringify({
      usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 },
    }))).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("returns no tokens for invalid or missing Gemini usage", () => {
    expect(parseGeminiStreamEvent("not json")).toEqual({});
    expect(parseGeminiStreamEvent(JSON.stringify({ candidates: [] }))).toEqual({
      inputTokens: undefined,
      outputTokens: undefined,
    });
  });

  it("uses the final complete OpenAI token totals", () => {
    expect(accumulateTokensFromStream("openai", [
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"Hello"}',
      'data: {"usage":{"input_tokens":10,"output_tokens":1}}',
      'data: {"response":{"usage":{"input_tokens":10,"output_tokens":5}}}',
      "data: [DONE]",
    ])).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("uses the final complete Gemini token totals and ignores malformed lines", () => {
    expect(accumulateTokensFromStream("google", [
      "data: not-json",
      'data: {"usageMetadata":{"promptTokenCount":15,"candidatesTokenCount":2}}',
      'data: {"usageMetadata":{"promptTokenCount":15,"candidatesTokenCount":8}}',
    ])).toEqual({ inputTokens: 15, outputTokens: 8 });
  });
});
