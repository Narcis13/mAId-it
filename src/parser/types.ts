/**
 * Internal Parser Types
 *
 * Types used internally by the parser that are not part of the public AST.
 */

/**
 * Represents the sections of a .flow.md file after splitting.
 */
export interface FileSections {
  /** Raw YAML frontmatter content (without --- delimiters) */
  frontmatter: string;
  /** Byte offset where frontmatter content starts (after opening ---\n) */
  frontmatterStart: number;
  /** Byte offset where frontmatter ends (before closing ---) */
  frontmatterEnd: number;
  /** Total lines in frontmatter section including --- delimiters */
  frontmatterLineCount: number;
  /** Raw XML body content */
  body: string;
  /** Byte offset where body starts */
  bodyStart: number;
}

/**
 * Raw XML node structure from fast-xml-parser.
 * The parser returns objects with special keys for attributes and text.
 */
export interface RawXMLNode {
  /** Attributes (prefixed with @ or in :@ object based on config) */
  ':@'?: Record<string, string>;
  /** Text content */
  '#text'?: string;
  /** Child elements - key is tag name, value is child node(s) */
  [tagName: string]: unknown;
}

/**
 * Result of splitting the file into sections.
 */
export type SplitResult =
  | { success: true; sections: FileSections }
  | { success: false; error: string; line?: number };
