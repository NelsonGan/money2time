import { normalizeMoneyAmount } from '~/utils/formatters';

type Operator = '+' | '-' | '×' | '÷';

export function formatMoney(value: number) {
  if (!Number.isFinite(value)) return '0.00';
  return normalizeMoneyAmount(value).toFixed(2);
}

function normalizeExpression(expression: string) {
  return expression.replace(/×/g, '*').replace(/÷/g, '/');
}

function trimTrailingOperator(expression: string) {
  return expression.replace(/[+\-×÷]+$/g, '');
}

function tokenize(expression: string): (number | string)[] {
  const normalized = normalizeExpression(expression);
  const tokens: (number | string)[] = [];
  let current = '';

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];

    if ((char >= '0' && char <= '9') || char === '.') {
      current += char;
      continue;
    }

    if ('+-*/'.includes(char)) {
      if (current) {
        tokens.push(Number(current));
        current = '';
      }
      tokens.push(char);
    }
  }

  if (current) {
    tokens.push(Number(current));
  }

  return tokens;
}

export function evaluateExpression(expression: string) {
  const cleaned = trimTrailingOperator(expression);
  if (!cleaned) return 0;

  const normalizedForUnary = cleaned.startsWith('-') ? `0${cleaned}` : cleaned;
  const tokens = tokenize(normalizedForUnary);
  if (tokens.length === 0) return 0;

  const stack: (number | string)[] = [];
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token === '*' || token === '/') {
      const prev = stack.pop();
      const next = tokens[index + 1];
      if (typeof prev !== 'number' || typeof next !== 'number') return 0;
      if (token === '/' && next === 0) return 0;
      stack.push(token === '*' ? prev * next : prev / next);
      index += 2;
      continue;
    }

    stack.push(token);
    index += 1;
  }

  let result = typeof stack[0] === 'number' ? stack[0] : 0;
  for (let i = 1; i < stack.length; i += 2) {
    const operator = stack[i];
    const next = stack[i + 1];
    if (typeof next !== 'number') break;
    if (operator === '+') result += next;
    if (operator === '-') result -= next;
  }

  if (!Number.isFinite(result)) return 0;
  return normalizeMoneyAmount(result);
}

function getCurrentOperand(expression: string) {
  const parts = expression.split(/[+\-×÷]/);
  return parts[parts.length - 1] ?? '';
}

export function sanitizeInitialAmount(value: string) {
  if (!value) return '';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '';
  return formatMoney(numericValue);
}

export function appendDigit(current: string, digit: string) {
  const operand = getCurrentOperand(current);
  const decimalPointIndex = operand.indexOf('.');
  if (decimalPointIndex >= 0) {
    const decimalPlaces = operand.slice(decimalPointIndex + 1).length;
    if (decimalPlaces >= 2) return current;
  }
  if (operand === '0') {
    return `${current.slice(0, -1)}${digit}`;
  }
  if (operand === '-0') {
    return `${current.slice(0, -1)}${digit}`;
  }
  return `${current}${digit}`;
}

export function appendDecimal(current: string) {
  const operand = getCurrentOperand(current);
  if (operand.includes('.')) return current;
  if (current === '-') return '-0.';
  if (current === '' || /[+\-×÷]$/.test(current)) return `${current}0.`;
  return `${current}.`;
}

export function appendOperator(current: string, operator: Operator) {
  if (!current) return operator === '-' ? '-' : '';
  if (/[+\-×÷]$/.test(current)) return `${current.slice(0, -1)}${operator}`;
  return `${current}${operator}`;
}

/**
 * Shared reducer for the numpad's calculator keys: digits `0`–`9`, `.`, `del`,
 * `=`, the four operators, and the combo operator keys (`plusTimes` cycles
 * `+` ↔ `×`, `minusDivide` cycles `−` ↔ `÷`). Applies the pre-fill "pristine"
 * behaviour — the first digit/decimal after a seeded value replaces it, while
 * operators append. Component-specific keys (`C`, `enter`/`done`) are handled by
 * the caller. Unknown keys are a no-op. Returns the next expression + pristine
 * flag so both NumpadPanel and MiniNumpad can share one implementation.
 */
export function reduceNumpadKey(
  expression: string,
  pristine: boolean,
  rawKey: string,
): { expression: string; pristine: boolean } {
  let key = rawKey;
  if (rawKey === 'plusTimes' || rawKey === 'minusDivide') {
    const primary = rawKey === 'plusTimes' ? '+' : '-';
    const secondary = rawKey === 'plusTimes' ? '×' : '÷';
    key = expression.slice(-1) === primary ? secondary : primary;
  }

  let current = expression;
  let nextPristine = pristine;
  if (pristine) {
    nextPristine = false;
    if ((key >= '0' && key <= '9') || key === '.') current = '';
  }

  if (key >= '0' && key <= '9') {
    return { expression: appendDigit(current, key), pristine: nextPristine };
  }
  if (key === '.') {
    return { expression: appendDecimal(current), pristine: nextPristine };
  }
  if (key === 'del') {
    return { expression: current.slice(0, -1), pristine: nextPristine };
  }
  if (key === '=') {
    // "=" only computes a pending operation; a plain number (a leading "-" is
    // just a sign) is left untouched so it stays editable. After a real
    // computation the result behaves like a pre-fill (pristine again).
    const body = current.startsWith('-') ? current.slice(1) : current;
    if (!/[+\-×÷]/.test(body)) return { expression: current, pristine: nextPristine };
    return { expression: formatMoney(evaluateExpression(current)), pristine: true };
  }
  if (key === '+' || key === '-' || key === '×' || key === '÷') {
    return { expression: appendOperator(current, key), pristine: nextPristine };
  }
  return { expression: current, pristine: nextPristine };
}
