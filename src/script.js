const resultEl = document.querySelector("#result");
const formulaEl = document.querySelector("#formula");
const keypad = document.querySelector(".calculator-pad");

const formatter = new Intl.NumberFormat("en-US", {
  useGrouping: true,
  maximumFractionDigits: 12,
});

const OPERATIONS = {
  add: {
    symbol: "+",
    fn: (a, b) => a + b,
  },
  subtract: {
    symbol: "−",
    fn: (a, b) => a - b,
  },
  multiply: {
    symbol: "×",
    fn: (a, b) => a * b,
  },
  divide: {
    symbol: "÷",
    fn: (a, b) => (b === 0 ? NaN : a / b),
  },
};

class Calculator {
  constructor(resultNode, formulaNode) {
    this.resultNode = resultNode;
    this.formulaNode = formulaNode;
    this.reset();
  }

  reset() {
    this.current = "0";
    this.stored = null;
    this.operation = null;
    this.lastOperand = null;
    this.lastOperator = null;
    this.lastLeftOperand = null;
    this.awaitingNext = false;
    this.updateDisplay();
    this.renderFormula();
  }

  clearEntry() {
    this.current = "0";
    this.awaitingNext = false;
    this.updateDisplay();
  }

  inputDigit(digit) {
    if (this.awaitingNext) {
      this.current = digit;
      this.awaitingNext = false;
      this.updateDisplay();
      return;
    }

    if (this.current === "0") {
      this.current = digit;
    } else if (this.current.replace("-", "").length < 15) {
      this.current += digit;
    }

    this.updateDisplay();
  }

  inputDecimal() {
    if (this.awaitingNext) {
      this.current = "0.";
      this.awaitingNext = false;
      this.updateDisplay();
      return;
    }

    if (!this.current.includes(".")) {
      this.current += ".";
      this.updateDisplay();
    }
  }

  toggleSign() {
    if (this.current === "0") return;
    this.current = this.current.startsWith("-")
      ? this.current.slice(1)
      : `-${this.current}`;
    this.updateDisplay();
  }

  percent() {
    const value = parseFloat(this.current);
    if (Number.isNaN(value)) return;

    if (this.stored !== null && this.operation) {
      const base = this.stored;
      this.current = String(base * (value / 100));
    } else {
      this.current = String(value / 100);
    }

    this.updateDisplay();
  }

  setOperation(name) {
    if (this.operation && !this.awaitingNext) {
      this.compute();
    }

    const numericCurrent = parseFloat(this.current);
    if (!Number.isFinite(numericCurrent)) {
      return;
    }

    this.stored = numericCurrent;
    this.operation = name;
    this.lastOperand = null;
    this.lastOperator = null;
    this.awaitingNext = true;
    this.renderFormula();
  }

  compute() {
    if (!this.operation) {
      if (this.lastOperand !== null && this.lastOperator) {
        this.operation = this.lastOperator;
        this.stored = parseFloat(this.current);
      } else {
        return;
      }
    }

    const op = OPERATIONS[this.operation];
    const a = this.stored ?? parseFloat(this.current);
    const repeatEquals =
      !this.awaitingNext &&
      this.lastOperand !== null &&
      this.operation === this.lastOperator &&
      this.stored !== null;

    let b;
    if (this.awaitingNext) {
      b = this.lastOperand ?? a;
    } else if (repeatEquals) {
      b = this.lastOperand;
    } else {
      b = parseFloat(this.current);
    }

    if (Number.isNaN(a) || Number.isNaN(b)) {
      this.current = "NaN";
      this.stored = null;
      this.operation = null;
      this.awaitingNext = false;
      this.updateDisplay();
      this.renderFormula("Error");
      return;
    }

    const raw = op.fn(a, b);
    const result = this.normalize(raw);

    this.lastOperand = b;
    this.lastOperator = this.operation;
    this.lastLeftOperand = a;
    this.current = result;
    this.stored = null;
    this.operation = null;
    this.awaitingNext = false;
    this.updateDisplay(true);
    this.renderFormula();
  }

  normalize(value) {
    if (!Number.isFinite(value)) {
      return value === Infinity || value === -Infinity ? "∞" : "NaN";
    }
    const rounded = Math.round(value * 1e12) / 1e12;
    return rounded.toString();
  }

  formatNumber(value) {
    if (value === Infinity) return "∞";
    if (value === -Infinity) return "-∞";
    if (Number.isNaN(value)) return "NaN";
    const [integer, fraction] = value.toString().split(".");
    const formattedInt = formatter.format(Number(integer));
    return fraction !== undefined && fraction !== ""
      ? `${formattedInt}.${fraction}`
      : formattedInt;
  }

  renderFormula(status = null) {
    if (status) {
      this.formulaNode.textContent = status;
      return;
    }

    if (this.operation && this.stored !== null) {
      const symbol = OPERATIONS[this.operation].symbol;
      const stored = this.formatNumber(this.stored);
      this.formulaNode.textContent = `${stored} ${symbol}`;
      return;
    }

    if (this.lastOperator && this.lastOperand !== null && !this.awaitingNext) {
      const symbol = OPERATIONS[this.lastOperator].symbol;
      const leftValue = this.lastLeftOperand ?? parseFloat(this.current);
      const left = Number.isFinite(leftValue)
        ? this.formatNumber(leftValue)
        : `${leftValue}`;
      this.formulaNode.textContent = `${left} ${symbol} ${this.formatNumber(this.lastOperand)}`;
      return;
    }

    this.formulaNode.textContent = "";
  }

  updateDisplay(animate = false) {
    if (this.current === "∞" || this.current === "-∞" || this.current === "NaN") {
      this.resultNode.textContent = this.current;
      if (animate) this.animateResult();
      return;
    }

    const numeric = Number(this.current);
    if (!Number.isFinite(numeric)) {
      this.resultNode.textContent = this.current;
      if (animate) this.animateResult();
      return;
    }

    const [integer, fraction] = this.current.split(".");
    const formattedInt = formatter.format(Number(integer));
    this.resultNode.textContent = fraction !== undefined ? `${formattedInt}.${fraction}` : formattedInt;
    if (animate) this.animateResult();
  }

  animateResult() {
    this.resultNode.classList.remove("result--updating");
    void this.resultNode.offsetWidth;
    this.resultNode.classList.add("result--updating");
    window.setTimeout(() => {
      this.resultNode.classList.remove("result--updating");
    }, 320);
  }

  handleKey(key) {
    if (/^[0-9]$/.test(key)) {
      this.inputDigit(key);
      return;
    }

    switch (key) {
      case "+":
        this.setOperation("add");
        break;
      case "-":
        this.setOperation("subtract");
        break;
      case "*":
      case "x":
      case "X":
        this.setOperation("multiply");
        break;
      case "/":
        this.setOperation("divide");
        break;
      case "Enter":
      case "=":
        this.compute();
        break;
      case "Backspace":
        this.backspace();
        break;
      case "%":
        this.percent();
        break;
      case ".":
        this.inputDecimal();
        break;
      case "Escape":
        this.reset();
        break;
    }
  }

  backspace() {
    if (this.awaitingNext) return;
    if (this.current.length <= 1 || (this.current.length === 2 && this.current.startsWith("-"))) {
      this.current = "0";
    } else {
      this.current = this.current.slice(0, -1);
    }
    this.updateDisplay();
  }
}

const calculator = new Calculator(resultEl, formulaEl);

function handleKeypadClick(event) {
  const target = event.target.closest("button");
  if (!target) return;
  target.classList.add("key--pressed");
  window.setTimeout(() => target.classList.remove("key--pressed"), 140);

  const { value } = target.dataset;
  const action = target.dataset.action;

  if (value !== undefined) {
    calculator.inputDigit(value);
    return;
  }

  if (!action) return;

  const ops = {
    add: "add",
    subtract: "subtract",
    multiply: "multiply",
    divide: "divide",
  };

  if (ops[action]) {
    calculator.setOperation(ops[action]);
    return;
  }

  switch (action) {
    case "decimal":
      calculator.inputDecimal();
      break;
    case "equals":
      calculator.compute();
      break;
    case "clear-all":
      calculator.reset();
      break;
    case "clear-entry":
      calculator.clearEntry();
      break;
    case "toggle-sign":
      calculator.toggleSign();
      break;
    case "percent":
      calculator.percent();
      break;
    default:
      break;
  }
}

keypad.addEventListener("click", handleKeypadClick);

window.addEventListener("keydown", (event) => {
  const key = event.key;
  const allowed = /[0-9]|[+\-*/xX=.%]|Enter|Escape|Backspace/.test(key);
  if (!allowed) return;
  event.preventDefault();
  
  const button = findButtonForKey(key);
  if (button) {
    button.classList.add("key--pressed");
    window.setTimeout(() => button.classList.remove("key--pressed"), 140);
    provideHapticFeedback(button);
  }
  
  calculator.handleKey(key);
});

function findButtonForKey(key) {
  if (/^[0-9]$/.test(key)) {
    return document.querySelector(`[data-value="${key}"]`);
  }
  
  const actionMap = {
    "+": "add",
    "-": "subtract",
    "*": "multiply",
    "x": "multiply",
    "X": "multiply",
    "/": "divide",
    "Enter": "equals",
    "=": "equals",
    ".": "decimal",
    "%": "percent",
    "Escape": "clear-all",
    "Backspace": "clear-entry"
  };
  
  const action = actionMap[key];
  return action ? document.querySelector(`[data-action="${action}"]`) : null;
}

window.addEventListener("resize", debounce(syncViewportHeight, 150));

syncViewportHeight();

function syncViewportHeight() {
  const doc = document.documentElement;
  doc.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
}

function debounce(fn, wait = 100) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), wait);
  };
}

// Progressive enhancement: support installed display mode adjustments
if (window.matchMedia("(display-mode: standalone)").matches) {
  document.body.classList.add("standalone");
}

function provideHapticFeedback(button) {
  if (typeof navigator.vibrate !== "function") return;
  
  if (button.classList.contains("key--accent")) {
    navigator.vibrate([8, 10, 12]);
  } else if (button.classList.contains("key--operator")) {
    navigator.vibrate(10);
  } else {
    navigator.vibrate(6);
  }
}

document.addEventListener("pointerdown", (event) => {
  const button = event.target.closest(".key");
  if (!button) return;
  provideHapticFeedback(button);
});
