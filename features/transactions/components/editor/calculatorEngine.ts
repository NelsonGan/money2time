type Operator = '+' | '-' | '×' | '÷';

export function formatMoney(value: number) {
  if (!Number.isFinite(value)) return '0';
  return value
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
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
  return result;
}

function getCurrentOperand(expression: string) {
  const parts = expression.split(/[+\-×÷]/);
  return parts[parts.length - 1] ?? '';
}

export function sanitizeInitialAmount(value: string) {
  if (!value) return '';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '';
  return String(numericValue);
}

export function appendDigit(current: string, digit: string) {
  const operand = getCurrentOperand(current);
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
