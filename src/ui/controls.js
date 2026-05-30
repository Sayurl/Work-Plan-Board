function field(parent, label, value, type = "text") {
  const row = parent.createDiv("ptb-form-row");
  row.createEl("label", { text: label });
  const input = document.createElement("input");
  input.type = type;
  row.appendChild(input);
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
  searchField,
  area,
  autoResizeTextarea,
  selectField
};
