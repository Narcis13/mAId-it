# Expression Engine - Deep Exploration Report

## Overview

The Expression Engine is the subsystem responsible for parsing, evaluating, and resolving template expressions within FlowScript workflows. It lives in `src/expression/` and is built on top of the **jsep** (JavaScript Expression Parser) library with custom configuration, a sandboxed AST-walking evaluator, a layered context resolution system, and a rich library of 60+ built-in functions.

### Module Structure

```
src/expression/
  index.ts          - Module entry point, re-exports, evaluateTemplate()
  types.ts          - TemplateSegment, EvalContext, ExpressionError
  parser.ts         - Template extraction + jsep wrapper
  evaluator.ts      - Sandboxed AST-walking evaluator
  context.ts        - Context building from execution state
  functions/
    index.ts        - Function registry (getBuiltinFunctions)
    string.ts       - 17 string manipulation functions
    array.ts        - 20 array manipulation functions
    math.ts         - 16 math functions
    type.ts         - 20 type checking/conversion functions
    object.ts       - 14 object manipulation functions
    time.ts         - 16 date/time functions (using Luxon)
    functions.test.ts - Comprehensive tests for all function categories
  evaluator.test.ts - Evaluator tests including security tests
  parser.test.ts    - Parser and template extraction tests
```

---

## 1. Expression Syntax

### 1.1 Template String Syntax (`{{...}}`)

Expressions are embedded in strings using double-curly-brace delimiters: `{{expression}}`.

**File:** `src/expression/parser.ts:50-89` (`extractTemplateSegments`)

The template parser uses the regex `/\{\{(.+?)\}\}/g` to find expression segments. The `.+?` is non-greedy, meaning nested `{{` are NOT supported. Whitespace inside delimiters is trimmed.

Examples:
- `"Hello {{name}}!"` -> text("Hello ") + expr("name") + text("!")
- `"{{a}} and {{b}}"` -> expr("a") + text(" and ") + expr("b")
- `"{{ name }}"` -> expr("name") (whitespace trimmed)
- `"{{a + b}}"` -> expr("a + b")

**Result type:** `TemplateSegment[]` where each segment has:
- `type`: `'text'` | `'expression'`
- `value`: the raw text or the expression string (without `{{}}`)
- `start` / `end`: character positions in the original template

### 1.2 Expression Parsing (jsep)

**File:** `src/expression/parser.ts:114-126` (`parseExpression`)

Expressions are parsed by jsep into an AST. The jsep configuration customizes the default JavaScript expression grammar:

**Removed operators** (bitwise operators stripped for safety):
- `>>>`, `>>`, `<<`, `|`, `^`, `&`

**Added operators:**
- `??` (nullish coalescing) at precedence 1 (lowest)

### 1.3 Supported AST Node Types

The evaluator (`src/expression/evaluator.ts:37-237`) handles these node types:

| Node Type | Syntax | Example |
|---|---|---|
| `Literal` | Numbers, strings, booleans, null | `42`, `"hello"`, `true`, `null` |
| `Identifier` | Variable references | `name`, `x`, `$config` |
| `MemberExpression` | Dot notation / bracket notation | `user.name`, `obj["key"]`, `obj[varKey]` |
| `CallExpression` | Function calls (identifier only) | `upper(name)`, `sum(arr)` |
| `BinaryExpression` | Binary operators | `a + b`, `x && y`, `a ?? b` |
| `UnaryExpression` | Unary operators | `!flag`, `-x`, `+str` |
| `ConditionalExpression` | Ternary operator | `a ? b : c` |
| `ArrayExpression` | Array literals | `[1, 2, 3]`, `[a, b, a + b]` |
| `Compound` | Comma-separated expressions | `a, b, c` (returns last value) |

**Explicitly blocked node types:**
- `ThisExpression` - throws ExpressionError

### 1.4 Supported Operators

**Binary Operators:**
| Category | Operators |
|---|---|
| Arithmetic | `+`, `-`, `*`, `/`, `%` |
| Comparison | `==`, `===`, `!=`, `!==`, `<`, `>`, `<=`, `>=` |
| Logical | `&&`, `||` (both short-circuit) |
| Nullish | `??` (short-circuits on non-null/undefined) |

**Unary Operators:**
| Operator | Description |
|---|---|
| `!` | Logical NOT |
| `-` | Numeric negation |
| `+` | Numeric coercion |

**NOT supported (removed):**
- Bitwise: `|`, `&`, `^`, `<<`, `>>`, `>>>`
- Assignment: `=`, `+=`, etc. (jsep does not parse these by default)
- Increment/Decrement: `++`, `--`

### 1.5 Member Access

**Dot notation:** `user.name`, `user.profile.name` (deep nesting supported)

**Bracket notation:** `obj["key"]`, `obj[dynamicKey]`
- Computed access evaluates the bracket expression to get the property name

**Null-safe access:** If the object is `null` or `undefined`, member access returns `undefined` instead of throwing. This is built-in behavior, NOT optional chaining syntax (`?.`).

### 1.6 Function Calls

**File:** `src/expression/evaluator.ts:82-111`

Only **direct function calls** are allowed: `fn(arg1, arg2)`.

**Method calls are blocked:** `obj.method()` throws an ExpressionError. The callee must be an `Identifier` node type, not a `MemberExpression`. This is a security constraint to prevent escaping the sandbox via methods like `toString()` or `valueOf()`.

Arguments are evaluated before being passed to the function.

### 1.7 Ternary / Conditional Expressions

Standard JavaScript ternary: `condition ? trueValue : falseValue`

Nested ternaries are supported: `a > b ? "greater" : a < b ? "less" : "equal"`

---

## 2. Built-in Functions (60+)

All built-in functions are registered in `src/expression/functions/index.ts` and merged into a flat namespace via `getBuiltinFunctions()`. All functions handle `null`/`undefined` inputs gracefully.

### 2.1 String Functions (17)

**File:** `src/expression/functions/string.ts`

| Function | Signature | Description |
|---|---|---|
| `upper` | `(s: string) -> string` | Convert to uppercase |
| `lower` | `(s: string) -> string` | Convert to lowercase |
| `trim` | `(s: string) -> string` | Remove leading/trailing whitespace |
| `replace` | `(s: string, old: string, repl: string) -> string` | Replace all occurrences |
| `split` | `(s: string, delim: string) -> string[]` | Split by delimiter |
| `join` | `(arr: unknown[], delim: string) -> string` | Join array with delimiter |
| `truncate` | `(s: string, len: number, suffix?: string) -> string` | Truncate with suffix (default `"..."`) |
| `concat` | `(...args: string[]) -> string` | Concatenate strings |
| `includes` | `(s: string, search: string) -> boolean` | Check substring presence |
| `starts_with` | `(s: string, prefix: string) -> boolean` | Check prefix |
| `ends_with` | `(s: string, suffix: string) -> boolean` | Check suffix |
| `substring` | `(s: string, start: number, end?: number) -> string` | Extract substring |
| `pad_start` | `(s: string, len: number, fill?: string) -> string` | Left-pad |
| `pad_end` | `(s: string, len: number, fill?: string) -> string` | Right-pad |
| `repeat` | `(s: string, count: number) -> string` | Repeat string n times |
| `char_at` | `(s: string, index: number) -> string` | Get character at index |
| `len` | `(s: string) -> number` | String length |

### 2.2 Array Functions (20)

**File:** `src/expression/functions/array.ts`

| Function | Signature | Description |
|---|---|---|
| `length` | `(arr: unknown[] \| string) -> number` | Length of array or string |
| `first` | `(arr: unknown[]) -> unknown` | First element |
| `last` | `(arr: unknown[]) -> unknown` | Last element |
| `slice` | `(arr: unknown[], start: number, end?: number) -> unknown[]` | Extract subarray |
| `flatten` | `(arr: unknown[]) -> unknown[]` | Flatten one level |
| `unique` | `(arr: unknown[]) -> unknown[]` | Remove duplicates (Set-based) |
| `reverse` | `(arr: unknown[]) -> unknown[]` | Reverse order (non-mutating) |
| `contains` | `(arr: unknown[], item: unknown) -> boolean` | Check if item exists |
| `index_of` | `(arr: unknown[], item: unknown) -> number` | Find index (-1 if missing) |
| `sort` | `(arr: unknown[], key?: string, dir?: 'asc'\|'desc') -> unknown[]` | Sort by value or object key |
| `compact` | `(arr: unknown[]) -> unknown[]` | Remove null/undefined |
| `count` | `(arr: unknown[], predicate?: Function) -> number` | Count elements (optionally filtered) |
| `at` | `(arr: unknown[], index: number) -> unknown` | Get at index (supports negative) |
| `concat` | `(...arrays: unknown[][]) -> unknown[]` | Concatenate arrays |
| `every` | `(arr: unknown[], predicate: Function) -> boolean` | All match predicate |
| `some` | `(arr: unknown[], predicate: Function) -> boolean` | Any match predicate |
| `find` | `(arr: unknown[], predicate: Function) -> unknown` | Find first match |
| `take` | `(arr: unknown[], n: number) -> unknown[]` | First n elements |
| `skip` | `(arr: unknown[], n: number) -> unknown[]` | Skip first n elements |
| `range` | `(start: number, end: number, step?: number) -> number[]` | Generate integer sequence |

**Note on predicates:** Functions like `every`, `some`, `find`, `count` accept predicate functions. However, since the expression evaluator does NOT support arrow functions/lambdas (see Limitations section), these predicate-accepting functions can only be used if the predicate is passed as a pre-defined function in the context, not constructed inline in the expression.

### 2.3 Math Functions (16)

**File:** `src/expression/functions/math.ts`

| Function | Signature | Description |
|---|---|---|
| `min` | `(...args: number[]) -> number` | Minimum value (filters non-numbers) |
| `max` | `(...args: number[]) -> number` | Maximum value (filters non-numbers) |
| `sum` | `(arr: number[]) -> number` | Sum array values |
| `avg` | `(arr: number[]) -> number` | Average of array (0 if empty) |
| `round` | `(n: number, decimals?: number) -> number` | Round to decimal places |
| `floor` | `(n: number) -> number` | Floor |
| `ceil` | `(n: number) -> number` | Ceiling |
| `abs` | `(n: number) -> number` | Absolute value |
| `pow` | `(base: number, exp: number) -> number` | Exponentiation |
| `sqrt` | `(n: number) -> number` | Square root |
| `random` | `() -> number` | Random [0, 1) |
| `random_int` | `(min: number, max: number) -> number` | Random integer [min, max] |
| `clamp` | `(n: number, min: number, max: number) -> number` | Constrain value to range |
| `mod` | `(n: number, divisor: number) -> number` | Remainder |
| `sign` | `(n: number) -> number` | Sign (-1, 0, or 1) |
| `trunc` | `(n: number) -> number` | Truncate towards zero |
| `percent` | `(value: number, total: number, decimals?: number) -> number` | Calculate percentage |

### 2.4 Type Functions (20)

**File:** `src/expression/functions/type.ts`

| Function | Signature | Description |
|---|---|---|
| `typeof` | `(val: unknown) -> string` | Type name ('null', 'undefined', 'array', 'object', 'string', 'number', 'boolean', 'function') |
| `is_null` | `(val: unknown) -> boolean` | Checks null OR undefined |
| `is_array` | `(val: unknown) -> boolean` | Array.isArray check |
| `is_object` | `(val: unknown) -> boolean` | Plain object (not null, not array) |
| `is_string` | `(val: unknown) -> boolean` | String type check |
| `is_number` | `(val: unknown) -> boolean` | Number check (excludes NaN) |
| `is_boolean` | `(val: unknown) -> boolean` | Boolean type check |
| `is_empty` | `(val: unknown) -> boolean` | Null, undefined, empty string, empty array, or empty object |
| `to_string` | `(val: unknown) -> string` | Convert to string (JSON for objects) |
| `to_number` | `(val: unknown) -> number` | Convert to number (0 for invalid) |
| `to_boolean` | `(val: unknown) -> boolean` | Boolean coercion |
| `to_array` | `(val: unknown) -> unknown[]` | Wrap in array, empty for null |
| `coalesce` | `(...args: unknown[]) -> unknown` | First non-null/undefined argument |
| `default` | `(val: unknown, defaultValue: unknown) -> unknown` | Value or fallback |
| `if_else` | `(condition: unknown, then: unknown, else: unknown) -> unknown` | Conditional as function |
| `is_finite` | `(val: unknown) -> boolean` | Finite number check |
| `is_integer` | `(val: unknown) -> boolean` | Integer check |
| `is_nan` | `(val: unknown) -> boolean` | NaN check |
| `is_truthy` | `(val: unknown) -> boolean` | Truthy check |
| `is_falsy` | `(val: unknown) -> boolean` | Falsy check |

### 2.5 Object Functions (14)

**File:** `src/expression/functions/object.ts`

| Function | Signature | Description |
|---|---|---|
| `keys` | `(obj: object) -> string[]` | Object keys |
| `values` | `(obj: object) -> unknown[]` | Object values |
| `entries` | `(obj: object) -> [string, unknown][]` | Key-value pairs |
| `from_entries` | `(entries: [string, unknown][]) -> Record<string, unknown>` | Create object from pairs |
| `get` | `(obj: object, path: string, default?: unknown) -> unknown` | Get nested value by dot path |
| `has` | `(obj: object, key: string) -> boolean` | Check key existence |
| `merge` | `(...objects: object[]) -> Record<string, unknown>` | Shallow merge |
| `pick` | `(obj: object, keys: string[]) -> Record<string, unknown>` | Select keys |
| `omit` | `(obj: object, keys: string[]) -> Record<string, unknown>` | Remove keys |
| `size` | `(obj: object) -> number` | Number of keys |
| `set` | `(obj: object, path: string, value: unknown) -> Record<string, unknown>` | Set nested value (immutable, returns new object) |
| `delete` | `(obj: object, key: string) -> Record<string, unknown>` | Remove key (immutable) |
| `equals` | `(a: unknown, b: unknown) -> boolean` | Deep equality |
| `clone` | `(obj: unknown) -> unknown` | Deep clone |

### 2.6 Time Functions (16)

**File:** `src/expression/functions/time.ts` (powered by Luxon)

| Function | Signature | Description |
|---|---|---|
| `now` | `() -> string \| null` | Current datetime as ISO string |
| `date` | `(format?: string) -> string \| null` | Current date (ISO or custom format) |
| `time` | `(format?: string) -> string \| null` | Current time (ISO or custom format) |
| `parse_date` | `(str: string, format?: string) -> string \| null` | Parse date string to ISO |
| `format_date` | `(isoDate: string, format: string) -> string \| null` | Format ISO date |
| `add_time` | `(isoDate: string, duration: string \| object) -> string \| null` | Add duration (ISO string or `{days: 1}` object) |
| `subtract_time` | `(isoDate: string, duration: string \| object) -> string \| null` | Subtract duration |
| `diff` | `(date1: string, date2: string, unit?: string) -> number \| null` | Difference between dates in given unit |
| `timestamp` | `() -> number` | Unix timestamp in milliseconds |
| `from_timestamp` | `(ts: number) -> string \| null` | Millisecond timestamp to ISO string |
| `start_of` | `(isoDate: string, unit: string) -> string \| null` | Start of day/week/month/year |
| `end_of` | `(isoDate: string, unit: string) -> string \| null` | End of day/week/month/year |
| `get_part` | `(isoDate: string, part: string) -> number \| null` | Extract year, month, day, hour, etc. |
| `is_before` | `(date1: string, date2: string) -> boolean` | Date comparison |
| `is_after` | `(date1: string, date2: string) -> boolean` | Date comparison |
| `relative` | `(isoDate: string) -> string \| null` | Relative time string (e.g., "2 days ago") |

### 2.7 Utility Functions (11)

**File:** `src/expression/functions/index.ts` (defined inline)

| Function | Signature | Description |
|---|---|---|
| `json_encode` | `(obj: unknown) -> string` | JSON.stringify |
| `json_decode` | `(s: string) -> unknown` | JSON.parse (returns null on error) |
| `base64_encode` | `(s: string) -> string` | btoa encoding |
| `base64_decode` | `(s: string) -> string \| null` | atob decoding (null on error) |
| `url_encode` | `(s: string) -> string` | encodeURIComponent |
| `url_decode` | `(s: string) -> string` | decodeURIComponent (returns original on error) |
| `uuid` | `() -> string` | Generate UUID v4 via crypto.randomUUID() |
| `match` | `(s: string, pattern: string) -> string \| null` | First regex match |
| `test` | `(s: string, pattern: string) -> boolean` | Test regex match |
| `match_all` | `(s: string, pattern: string) -> string[]` | All regex matches |
| `hash` | `(s: string) -> number` | djb2 hash (non-cryptographic) |
| `pretty` | `(val: unknown, indent?: number) -> string` | Pretty-print JSON |

---

## 3. Context Resolution

### 3.1 EvalContext Structure

**File:** `src/expression/types.ts:45-50`

```typescript
interface EvalContext {
  variables: Record<string, unknown>;    // Variables accessible in expressions
  functions: Record<string, Function>;   // Whitelisted callable functions
}
```

All variable lookups resolve against `context.variables`. All function calls resolve against `context.functions`.

### 3.2 Building Context from Execution State

**File:** `src/expression/context.ts:24-55` (`buildEvaluationContext`)

Context is built from the `ExecutionState` using a layered override hierarchy:

```
Layer 1: state.globalContext    (base - workflow-wide variables)
Layer 2: state.phaseContext     (overrides global - phase-specific variables)
Layer 3: state.nodeContext      (overrides phase - node-specific variables)
```

Each layer is applied with `Object.assign()`, so later layers override earlier ones for same-named keys.

### 3.3 Special Prefixes

After the three context layers are applied, these special variables are injected:

| Variable | Source | Description |
|---|---|---|
| `$config` | `state.config` | Workflow configuration (from frontmatter `config:` block) |
| `$secrets` | `state.secrets` | Secret values (from frontmatter `secrets:` block) |
| `$context` | Merged global + phase + node context | Combined context snapshot |

### 3.4 Node Output Access

**File:** `src/expression/context.ts:46-49`

All completed node outputs are added as variables using the pattern `nodeId.output`:

```typescript
// For each successfully completed node:
variables[nodeId] = { output: <node's output value> };
```

This means in an expression you can write: `fetchData.output.body` to access the `body` field of the output from a node named `fetchData`.

The outputs are retrieved via `getNodeOutputs(state)` from `src/execution/state.ts:67`, which iterates `state.nodeResults` and includes only nodes with `status === 'success'`.

### 3.5 Creating Standalone Contexts

**File:** `src/expression/context.ts:60-68` (`createEvalContext`)

For testing or standalone expression evaluation, you can create a context with custom variables and optionally custom functions. If no functions are provided, the full built-in function set is used by default.

### 3.6 Secret Redaction

**File:** `src/expression/context.ts:77-94` (`redactSecrets`)

The `redactSecrets()` function replaces all secret values with `'[REDACTED]'` for safe logging. The `contextToString()` function uses this to create a safe string representation showing only variable names (not values) and function count.

---

## 4. Template Evaluation Pipeline

**File:** `src/expression/index.ts:58-100` (`evaluateTemplate`)

The full pipeline for evaluating a template string:

1. **Extract segments:** `extractTemplateSegments(template)` parses `{{...}}` delimiters
2. **For each segment:**
   - `text` segments: appended directly to result
   - `expression` segments: passed to `evaluate(segment.value, context)`
3. **Result conversion:**
   - `null` / `undefined` -> `''` (empty string)
   - Objects/arrays -> `JSON.stringify(result)`
   - Everything else -> `String(result)`
4. **Concatenation:** All parts joined to produce the final string

**Error handling:** If an expression throws `ExpressionError`, it's re-thrown with template context (the full template string and position information).

---

## 5. Security Model

### 5.1 Sandboxed Evaluation

The evaluator is a custom AST walker (NOT `eval()` or `new Function()`). It only evaluates recognized node types, rejecting anything unexpected.

### 5.2 Prototype Chain Protection

**File:** `src/expression/evaluator.ts:20-21`

```typescript
const BLOCKED_PROPS = new Set(['__proto__', 'constructor', 'prototype']);
```

Any attempt to access these properties via dot notation or bracket notation throws an ExpressionError with a security message.

### 5.3 Function Call Restrictions

- Only **direct function calls** are permitted: `fn(args)` where `fn` is an `Identifier`
- **Method calls are blocked:** `obj.method()` throws because the callee is a `MemberExpression`
- Only **whitelisted functions** (those in `context.functions`) can be called
- Calling an undefined function throws ExpressionError

### 5.4 Blocked Expression Types

- `this` keyword is explicitly blocked
- Bitwise operators are removed at the jsep level
- Any unrecognized AST node type throws ExpressionError

---

## 6. Limitations, Missing Features, and Potential Issues

### 6.1 No Arrow Function / Lambda Support

The expression engine has **no support for arrow functions or lambda expressions**. This means built-in functions that accept predicates (`every`, `some`, `find`, `count`) cannot be used from within expressions unless the predicate is pre-injected into the context. There is no way to write `find(arr, x => x > 5)` inline.

**Impact:** Array filtering, mapping, and finding are significantly limited when used purely through the expression syntax. The `count(arr, predicate)` variant, `every(arr, predicate)`, `some(arr, predicate)`, and `find(arr, predicate)` are effectively unusable from expressions alone.

### 6.2 No Object Literal Syntax

The parser does not support object literals (`{key: value}`). While array literals `[1, 2, 3]` work via `ArrayExpression`, there's no `ObjectExpression` equivalent. Constructing objects inline in expressions is not possible. Functions like `add_time` that accept object parameters (e.g., `{days: 1}`) cannot receive inline object arguments from expressions.

### 6.3 No Optional Chaining (`?.`)

Although member access on `null`/`undefined` objects returns `undefined` (null-safe by default), there is no explicit optional chaining operator `?.`. The null-safety is automatic for all member accesses, which means you cannot distinguish between intentional null checks and accidental null access.

### 6.4 No `map` / `filter` / `reduce` Functions

Despite having a comprehensive array function library, there are no `map`, `filter`, or `reduce` functions. Combined with the lack of lambda support, there's no way to transform array elements within expressions. This seems like a notable gap given the workflow context.

### 6.5 Template Regex Limitation

The template regex `/\{\{(.+?)\}\}/g` uses non-greedy matching, which means:
- Nested `{{` inside an expression could cause incorrect parsing
- Empty expressions `{{}}` are not matched (the `.+?` requires at least one character)
- Expressions containing `}}` cannot be represented (no escaping mechanism)

### 6.6 No String Interpolation Inside Expressions

Expressions evaluate to raw values. There's no template literal syntax within expressions (no backtick strings). String building must use the `+` operator or the `concat()` function.

### 6.7 `concat` Function Name Collision

Both `stringFunctions` and `arrayFunctions` export a function named `concat`. Since they're merged into a flat namespace with spread, the array version (`arrayFunctions.concat`) overwrites the string version (`stringFunctions.concat`). The actual `concat` available in expressions concatenates arrays, not strings. Users must use the `+` operator for string concatenation.

### 6.8 No Exponent Operator (`**`)

While `pow(base, exp)` is available as a function, the `**` operator is not registered with jsep. This is a minor gap since the function alternative exists.

### 6.9 Loose Equality Available

Both `==` and `===` are supported. The presence of loose equality (`==`) could lead to unexpected type coercion in expressions. Workflow authors need to be careful to use `===` when strict comparison is needed.

### 6.10 No `in` Operator

There's no `in` operator for checking property existence in objects. Users must use the `has(obj, key)` function instead.

### 6.11 No Spread Syntax

Array and object spread (`...arr`, `...obj`) is not supported. Array concatenation requires the `concat()` function, and object merging requires the `merge()` function.

### 6.12 Compound Expressions Return Last Value Only

Comma-separated expressions (`a, b, c`) evaluate all but only return the last value. This could be confusing and seems like an edge case that may not be intentionally supported.

### 6.13 Error Context Could Be Richer

While `ExpressionError` includes `expression`, `template`, and `position`, the evaluator does not always propagate the full expression string when wrapping errors. Some error paths only include the operator or property name as the `expression` field, not the full original expression.

### 6.14 `add_time` / `subtract_time` Object Duration Parameter

These functions accept either ISO duration strings or JavaScript objects like `{days: 1}`. However, since object literals cannot be constructed in expressions (see 6.2), only the ISO duration string format (`"P1D"`) can be used from within template expressions. The object parameter form is only useful when the duration is pre-computed and passed as a variable.

### 6.15 No Assignment

Expressions are purely functional -- there is no way to assign or mutate variables. This is by design for safety but means complex multi-step computations must be split across multiple nodes in the workflow.

---

## 7. Key Design Decisions

1. **jsep over custom parser:** Leverages a battle-tested JS expression parser rather than writing a custom one. This provides standard JS expression syntax with minimal effort.

2. **AST walking over eval:** Security-first design -- never uses `eval()` or `Function()`. Every node type must be explicitly handled.

3. **Flat function namespace:** All functions live in a single namespace (no `string.upper()`, just `upper()`). This keeps expression syntax simple but risks name collisions.

4. **Null-safe by default:** Member access on null/undefined silently returns undefined rather than throwing. This is a pragmatic choice for workflow expressions where data may be sparse.

5. **Immutable operations:** Object functions like `set`, `delete`, `merge` all return new objects rather than mutating. This prevents side effects in expressions.

6. **Luxon for dates:** Uses the Luxon library for robust date/time handling, supporting ISO parsing, formatting, duration arithmetic, and relative time strings.
