/**
 * sanitize-html-compatible wrapper. Matches the surface of the `sanitize-html`
 * npm package closely enough that most drop-in replacements work, while
 * delegating the security-critical cleaning step to the native Rust binding.
 *
 * See `sanitize-html`'s README for full option semantics. Unsupported or
 * silently-ignored options are documented in DIFFERENCES.md.
 */

export interface TagTransformAttribs {
  [attr: string]: string
}

export interface TagTransformResult {
  tagName: string
  attribs?: TagTransformAttribs
  text?: string
}

export type TagTransform =
  | string
  | ((
      tagName: string,
      attribs: TagTransformAttribs,
      context: { text: string },
    ) => TagTransformResult)

export interface ExclusiveFilterFrame {
  tag: string
  attribs: TagTransformAttribs
  text: string
}

export interface SanitizeOptions {
  allowedTags?: string[] | false
  allowedAttributes?: { [tag: string]: string[] } | false
  allowedClasses?: { [tag: string]: string[] }
  allowedSchemes?: string[]
  allowedSchemesByTag?: { [tag: string]: string[] }
  allowedIframeHostnames?: string[]
  allowedIframeDomains?: string[]
  allowIframeRelativeUrls?: boolean
  allowProtocolRelative?: boolean
  stripComments?: boolean
  linkRel?: string
  transformTags?: { [tag: string]: TagTransform }
  exclusiveFilter?: (frame: ExclusiveFilterFrame) => boolean
  textFilter?: (text: string, tagName: string) => string
  // Accepted but not enforced.
  disallowedTagsMode?: 'discard' | 'escape' | 'recursiveEscape'
  allowedStyles?: unknown
  parseStyleAttributes?: boolean
  nestingLimit?: number
  allowVulnerableTags?: boolean
}

export interface SanitizeDefaults {
  allowedTags: string[]
  allowedAttributes: { [tag: string]: string[] }
}

export interface SanitizeFunction {
  (html: string | number | null | undefined, options?: SanitizeOptions): string
  defaults: SanitizeDefaults
  simpleTransform: (
    newTagName: string,
    newAttribs: TagTransformAttribs,
    merge?: boolean,
  ) => (tagName: string, attribs: TagTransformAttribs) => TagTransformResult
}

export const sanitize: SanitizeFunction

export function isClean(html: string, options?: SanitizeOptions): boolean

export default sanitize
