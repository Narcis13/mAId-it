/**
 * Source Location Tracking Utilities
 *
 * Provides utilities for converting byte offsets to line/column positions
 * and creating source locations for AST nodes.
 */

import type { Position, SourceLocation, SourceMap } from '../types';

/**
 * Build an index of line start offsets for fast position lookups.
 * Line 1 starts at offset 0.
 *
 * @param source - The source string to index
 * @returns Array of byte offsets where each line starts
 */
export function buildLineOffsets(source: string): number[] {
  const offsets = [0]; // Line 1 starts at offset 0
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      offsets.push(i + 1); // Next line starts after newline
    }
  }
  return offsets;
}

/**
 * Convert a byte offset to line/column position.
 * Uses binary search for efficiency on large files.
 *
 * @param offset - Byte offset in the source
 * @param lineOffsets - Array of line start offsets from buildLineOffsets
 * @returns Position with 1-indexed line, 0-indexed column, and offset
 */
export function offsetToPosition(offset: number, lineOffsets: number[]): Position {
  // Binary search for the line
  let low = 0;
  let high = lineOffsets.length - 1;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (lineOffsets[mid] <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const line = low + 1; // 1-indexed
  const column = offset - lineOffsets[low]; // 0-indexed

  return { line, column, offset };
}

/**
 * Create a SourceLocation from start and end offsets.
 *
 * @param startOffset - Byte offset where the location starts
 * @param endOffset - Byte offset where the location ends
 * @param lineOffsets - Array of line start offsets
 * @returns SourceLocation with start and end positions
 */
export function createLocation(
  startOffset: number,
  endOffset: number,
  lineOffsets: number[]
): SourceLocation {
  return {
    start: offsetToPosition(startOffset, lineOffsets),
    end: offsetToPosition(endOffset, lineOffsets),
  };
}

/**
 * Adjust a location by adding a line offset (for XML body after frontmatter).
 * This is necessary because the XML parser operates on just the body portion,
 * so its line numbers need to be adjusted to reflect the full file.
 *
 * @param loc - The location to adjust
 * @param lineOffset - Number of lines to add to the line numbers
 * @param byteOffset - Number of bytes to add to the byte offsets
 * @returns New SourceLocation with adjusted positions
 */
export function adjustLocation(
  loc: SourceLocation,
  lineOffset: number,
  byteOffset: number
): SourceLocation {
  return {
    start: {
      line: loc.start.line + lineOffset,
      column: loc.start.column,
      offset: loc.start.offset + byteOffset,
    },
    end: {
      line: loc.end.line + lineOffset,
      column: loc.end.column,
      offset: loc.end.offset + byteOffset,
    },
  };
}

/**
 * Create a SourceMap for the entire file.
 *
 * @param source - The full source content
 * @param filePath - Path to the source file
 * @returns SourceMap with source, filePath, and precomputed line offsets
 */
export function createSourceMap(source: string, filePath: string): SourceMap {
  return {
    source,
    filePath,
    lineOffsets: buildLineOffsets(source),
  };
}

/**
 * Find byte offset of a substring in source (for locating XML tags).
 *
 * @param source - The source string to search in
 * @param searchString - The string to find
 * @param startFrom - Optional offset to start searching from
 * @returns Byte offset of the first occurrence, or -1 if not found
 */
export function findOffset(source: string, searchString: string, startFrom = 0): number {
  return source.indexOf(searchString, startFrom);
}
