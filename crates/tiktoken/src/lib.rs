use napi::bindgen_prelude::*;
use napi_derive::napi;
use tiktoken_rs::{
    ChatCompletionRequestMessage, CoreBPE, bpe_for_model, cl100k_base_singleton,
    num_tokens_from_messages, o200k_base_singleton, o200k_harmony_singleton, p50k_base_singleton,
    p50k_edit_singleton, r50k_base_singleton,
};

#[napi(object)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub name: Option<String>,
}

#[napi(object)]
pub struct ChatEncodeResult {
    /// Concatenated content tokens (no ChatML framing).
    pub tokens: Uint32Array,
    /// Full ChatML token count including per-message framing and the
    /// assistant-reply priming tokens — the number OpenAI bills for input.
    pub count: u32,
}

fn encoding_by_name(name: &str) -> Result<&'static CoreBPE> {
    Ok(match name {
        "cl100k_base" => cl100k_base_singleton(),
        "o200k_base" => o200k_base_singleton(),
        "o200k_harmony" => o200k_harmony_singleton(),
        "p50k_base" => p50k_base_singleton(),
        "p50k_edit" => p50k_edit_singleton(),
        "r50k_base" | "gpt2" => r50k_base_singleton(),
        other => return Err(Error::from_reason(format!("unknown encoding: {other}"))),
    })
}

fn map_messages(messages: Vec<ChatMessage>) -> Vec<ChatCompletionRequestMessage> {
    messages
        .into_iter()
        .map(|m| ChatCompletionRequestMessage {
            role: m.role,
            content: Some(m.content),
            name: m.name,
            function_call: None,
            tool_calls: Vec::new(),
            refusal: None,
        })
        .collect()
}

#[napi]
pub struct Tiktoken {
    inner: &'static CoreBPE,
    name: String,
}

#[napi]
impl Tiktoken {
    #[napi(factory, js_name = "getEncoding")]
    pub fn get_encoding(name: String) -> Result<Self> {
        let inner = encoding_by_name(&name)?;
        Ok(Self { inner, name })
    }

    #[napi(factory, js_name = "encodingForModel")]
    pub fn encoding_for_model(model: String) -> Result<Self> {
        let inner = bpe_for_model(&model).map_err(|e| Error::from_reason(e.to_string()))?;
        Ok(Self { inner, name: model })
    }

    #[napi(getter)]
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Encode with all special tokens allowed. Matches `tiktoken` npm's
    /// `encode(text, "all")` and `gpt-tokenizer`'s default `encode`.
    #[napi]
    pub fn encode(&self, text: String) -> Uint32Array {
        Uint32Array::new(self.inner.encode_with_special_tokens(&text))
    }

    /// Encode without special-token expansion — treats `<|endoftext|>` etc.
    /// as literal text.
    #[napi(js_name = "encodeOrdinary")]
    pub fn encode_ordinary(&self, text: String) -> Uint32Array {
        Uint32Array::new(self.inner.encode_ordinary(&text))
    }

    #[napi]
    pub fn decode(&self, tokens: Uint32Array) -> Result<String> {
        let bytes = self
            .inner
            .decode_bytes(&tokens)
            .map_err(|e| Error::from_reason(e.to_string()))?;
        String::from_utf8(bytes).map_err(|e| Error::from_reason(e.to_string()))
    }

    /// Fast path for budget-gating: returns the token count without
    /// allocating the Uint32Array. Uses `encode_ordinary`.
    #[napi(js_name = "countTokens")]
    pub fn count_tokens(&self, text: String) -> u32 {
        self.inner.encode_ordinary(&text).len() as u32
    }

    /// `tiktoken-rs` has no native early-exit encoder; this full-encodes
    /// and compares. Kept for drop-in compatibility with gpt-tokenizer.
    #[napi(js_name = "isWithinTokenLimit")]
    pub fn is_within_token_limit(&self, text: String, limit: u32) -> bool {
        self.inner.encode_ordinary(&text).len() <= limit as usize
    }

    /// Batch-encode. Amortises the NAPI boundary over N texts — use when
    /// chunking a document for RAG rather than calling `encode` in a loop.
    #[napi(js_name = "encodeMany")]
    pub fn encode_many(&self, texts: Vec<String>) -> Vec<Uint32Array> {
        texts
            .into_iter()
            .map(|t| Uint32Array::new(self.inner.encode_ordinary(&t)))
            .collect()
    }

    /// Encode a chat conversation. Returns concatenated content tokens
    /// plus the full ChatML-framed count (what OpenAI bills).
    #[napi(js_name = "encodeChat")]
    pub fn encode_chat(
        &self,
        messages: Vec<ChatMessage>,
        model: String,
    ) -> Result<ChatEncodeResult> {
        let tiktoken_msgs = map_messages(messages);
        let count = num_tokens_from_messages(&model, &tiktoken_msgs)
            .map_err(|e| Error::from_reason(e.to_string()))?;

        let mut content_tokens: Vec<u32> = Vec::new();
        for msg in &tiktoken_msgs {
            if let Some(c) = &msg.content {
                content_tokens.extend(self.inner.encode_ordinary(c));
            }
        }

        Ok(ChatEncodeResult {
            tokens: Uint32Array::new(content_tokens),
            count: count as u32,
        })
    }

    /// Token count for a full ChatML conversation, matching what OpenAI
    /// bills. Equivalent to `gpt-tokenizer`'s `countChatCompletionTokens`.
    #[napi(js_name = "countChatCompletionTokens")]
    pub fn count_chat_completion_tokens(
        &self,
        messages: Vec<ChatMessage>,
        model: String,
    ) -> Result<u32> {
        let tiktoken_msgs = map_messages(messages);
        let count = num_tokens_from_messages(&model, &tiktoken_msgs)
            .map_err(|e| Error::from_reason(e.to_string()))?;
        Ok(count as u32)
    }
}
