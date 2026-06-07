function field(parent, label, value, type = "text") {
  const row = parent.createDiv("ptb-form-row");
  row.createEl("label", { text: label });
  const input = document.createElement("input");
  input.type = type;
  row.appendChild(input);
  if (type === "time") input.step = "900";
  input.value = value || "";
  return input;
}

function searchField(parent, label, value, options, config = {}) {
  const row = parent.createDiv("ptb-form-row");
  row.createEl("label", { text: label });
  const wrap = row.createDiv("ptb-search-field");
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = config.placeholder || "Type to search";
  input.value = value || "";
  wrap.appendChild(input);
  const searchButton = wrap.createEl("button", { text: "⌕" });
  searchButton.type = "button";
  searchButton.setAttribute("aria-label", `Search ${label}`);
  const results = row.createDiv("ptb-search-results");

  const renderResults = () => {
    results.empty();
    const normalized = input.value.trim().toLowerCase();
    if (!normalized) {
      results.removeClass("is-open");
      return;
    }
    const filtered = normalized
      ? options.filter((optionValue) => optionValue.toLowerCase().includes(normalized))
      : [];
    for (const optionValue of filtered.slice(0, 8)) {
      const option = results.createDiv("ptb-search-option");
      option.setText(optionValue);
      option.onclick = () => {
        input.value = optionValue;
        results.empty();
        results.removeClass("is-open");
      };
    }
    if (filtered.length === 0) {
      results.createDiv("ptb-search-empty").setText("No matches");
    }
    results.addClass("is-open");
  };
  input.addEventListener("input", renderResults);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      results.empty();
      results.removeClass("is-open");
    }
  });
  searchButton.onclick = renderResults;
  return input;
}

function area(parent, label, value) {
  const row = parent.createDiv("ptb-form-row");
  row.createEl("label", { text: label });
  const input = row.createEl("textarea");
  input.value = value || "";
  autoResizeTextarea(input);
  input.addEventListener("input", () => autoResizeTextarea(input));
  return input;
}

function timeSelectField(parent, label, value, config = {}) {
  const row = parent.createDiv("ptb-form-row");
  row.createEl("label", { text: label });
  const wrap = row.createDiv("ptb-time-select");
  const hourSelect = document.createElement("select");
  const minuteSelect = document.createElement("select");
  wrap.appendChild(hourSelect);
  wrap.createSpan({ text: ":", cls: "ptb-time-select-separator" });
  wrap.appendChild(minuteSelect);

  const allow24 = Boolean(config.allow24);
  const parsed = parseTimeValue(value, allow24);
  for (let hour = 0; hour <= (allow24 ? 24 : 23); hour += 1) {
    const option = document.createElement("option");
    option.text = String(hour).padStart(2, "0");
    option.value = String(hour);
    hourSelect.appendChild(option);
  }
  for (const minute of ["00", "15", "30", "45"]) {
    const option = document.createElement("option");
    option.text = minute;
    option.value = minute;
    minuteSelect.appendChild(option);
  }

  hourSelect.value = String(parsed.hour);
  minuteSelect.value = parsed.minute;
  const syncMinute = () => {
    if (hourSelect.value === "24") {
      minuteSelect.value = "00";
      minuteSelect.disabled = true;
    } else {
      minuteSelect.disabled = false;
    }
  };
  syncMinute();
  hourSelect.addEventListener("change", syncMinute);

  return {
    get value() {
      const hour = String(Number(hourSelect.value)).padStart(2, "0");
      return `${hour}:${minuteSelect.value}`;
    },
    set value(nextValue) {
      const next = parseTimeValue(nextValue, allow24);
      hourSelect.value = String(next.hour);
      minuteSelect.value = next.minute;
      syncMinute();
    },
    addEventListener(type, listener) {
      hourSelect.addEventListener(type, listener);
      minuteSelect.addEventListener(type, listener);
    }
  };
}

function parseTimeValue(value, allow24 = false) {
  const match = String(value || "").match(/^([01]\d|2[0-4]):([0-5]\d)$/);
  if (!match) return { hour: 9, minute: "00" };
  const hour = Number(match[1]);
  const rawMinute = match[2];
  if (hour === 24) return allow24 ? { hour: 24, minute: "00" } : { hour: 23, minute: "45" };
  const minute = ["00", "15", "30", "45"].includes(rawMinute) ? rawMinute : "00";
  return { hour, minute };
}

function autoResizeTextarea(input) {
  input.style.height = "auto";
  const min = input.value.trim() ? 52 : 30;
  input.style.height = `${Math.max(min, Math.min(input.scrollHeight, 150))}px`;
}

function selectField(parent, label, value, columns) {
  const row = parent.createDiv("ptb-form-row");
  row.createEl("label", { text: label });
  const select = document.createElement("select");
  row.appendChild(select);
  for (const column of columns) {
    const option = document.createElement("option");
    option.text = column.name;
    option.value = column.id;
    select.appendChild(option);
    option.selected = column.id === value;
  }
  return select;
}

module.exports = {
  field,
  timeSelectField,
  parseTimeValue,
  searchField,
  area,
  autoResizeTextarea,
  selectField
};
