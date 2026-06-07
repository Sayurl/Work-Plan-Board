const { PluginSettingTab, Setting, setIcon } = require("obsidian");
const { isManualColumn, isSmartColumn } = require("../columns/column-model");
const { makeColumnId, normalizeTag } = require("../utils/text");

class TaskBoardSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Work Plan Board" });

    new Setting(containerEl)
      .setName("Completed task policy")
      .setDesc("Applied when the board refreshes. Completed tasks remain visible until refresh so accidental completion can be undone.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("keep", "Keep in _Tasks.md")
          .addOption("archive", "Move to _Done.md on refresh")
          .addOption("delete", "Delete on refresh")
          .setValue(this.plugin.config.settings.completedTaskPolicy || "keep")
          .onChange(async (value) => {
            this.plugin.config.settings.completedTaskPolicy = value;
            await this.plugin.savePluginData();
          });
      });

    new Setting(containerEl)
      .setName("Timeline slot height")
      .setDesc("Pixel height for each timeline slot. Lower values make the schedule board shorter.")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "24";
        text.inputEl.max = "140";
        text.inputEl.step = "1";
        text.setValue(String(this.plugin.config.timelineSettings.slotHeight || 36));
        text.inputEl.addEventListener("blur", async () => {
          const value = Number(text.getValue());
          if (!Number.isFinite(value)) return;
          this.plugin.config.timelineSettings.slotHeight = Math.max(24, Math.min(140, Math.round(value)));
          await this.plugin.savePluginData();
          this.plugin.renderViews();
          this.display();
        });
      });

    const columnSetting = new Setting(containerEl)
      .setName("Columns")
      .setDesc("Manage manual columns, smart views, layout, and task migration when deleting columns.");
    columnSetting.settingEl.addClass("ptb-columns-setting");
    columnSetting.infoEl.addClass("ptb-columns-setting-header");
    const columnChevron = columnSetting.nameEl.createSpan({ cls: "ptb-settings-chevron ptb-columns-chevron" });
    setIcon(columnChevron, "chevron-down");
    columnSetting.nameEl.prepend(columnChevron);
    columnSetting.controlEl.createSpan({ text: String(this.plugin.dashboard.columns.length), cls: "ptb-count" });

    const columnPanel = document.createElement("div");
    columnPanel.addClass("ptb-settings-column-panel");
    const columnPanelInner = columnPanel.createDiv("ptb-settings-column-panel-inner");
    columnSetting.settingEl.appendChild(columnPanel);
    const toggleColumns = () => {
      const isOpen = columnSetting.settingEl.hasClass("is-open");
      columnSetting.settingEl.toggleClass("is-open", !isOpen);
      columnPanel.style.maxHeight = isOpen ? "0px" : `${columnPanel.scrollHeight}px`;
    };
    columnPanel.addEventListener("toggle", () => {
      if (columnSetting.settingEl.hasClass("is-open")) {
        columnPanel.style.maxHeight = `${columnPanel.scrollHeight}px`;
      }
    }, true);
    columnSetting.infoEl.onclick = toggleColumns;
    columnSetting.infoEl.setAttribute("role", "button");
    columnSetting.infoEl.setAttribute("tabindex", "0");
    columnSetting.infoEl.onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleColumns();
    };

    columnPanelInner.createDiv({
      text: "Column Details",
      cls: "ptb-settings-column-details-title"
    });

    const list = columnPanelInner.createDiv("ptb-settings-columns");
    for (const [index, column] of this.plugin.dashboard.columns.entries()) {
      this.renderColumnSetting(list, column, index);
    }

    const columnActions = columnPanelInner.createDiv("ptb-settings-column-actions");
    const addButton = columnActions.createEl("button", { text: "Add column" });
    addButton.addClass("mod-cta");
    addButton.onclick = async () => {
      const columns = this.plugin.dashboard.columns.slice();
      const baseName = "New Column";
      const id = makeColumnId(baseName, columns);
      columns.push({
        id,
        name: baseName,
        type: "manual",
        categoryTag: `#${id}`,
        layoutGroup: "secondary",
        taskIds: []
      });
      await this.plugin.updateColumns(columns);
      this.display();
    };

    const resetButton = columnActions.createEl("button", { text: "Reset to defaults" });
    resetButton.addClass("mod-warning");
    resetButton.onclick = async () => {
      await this.plugin.resetColumnsToDefault();
      this.display();
    };

    columnPanelInner.createDiv({
      text: "Resetting restores default columns and moves tasks from custom columns to Inbox.",
      cls: "ptb-settings-column-note"
    });
  }

  renderColumnSetting(parent, column, index) {
    const details = parent.createDiv("ptb-settings-column");
    const summary = details.createDiv("ptb-settings-column-summary");
    const chevron = summary.createSpan({ cls: "ptb-settings-chevron" });
    setIcon(chevron, "chevron-down");
    summary.createEl("strong", { text: column.name });
    if (isSmartColumn(column)) {
      summary.createSpan({ text: "Auto", cls: "ptb-chip" });
      summary.createSpan({ text: column.smartType === "deadline" ? "Due date" : "Smart", cls: "ptb-chip" });
    } else {
      summary.createSpan({ text: column.categoryTag, cls: "ptb-chip" });
    }
    summary.createSpan({ text: column.layoutGroup === "primary" ? "Top" : "Bottom", cls: "ptb-chip" });
    const body = details.createDiv("ptb-settings-column-body");
    const row = body.createDiv("ptb-settings-column-body-inner");
    summary.onclick = () => {
      const isOpen = details.hasClass("is-open");
      details.toggleClass("is-open", !isOpen);
      body.style.maxHeight = isOpen ? "0px" : `${body.scrollHeight}px`;
    };
    body.addEventListener("toggle", () => {
      if (details.hasClass("is-open")) {
        body.style.maxHeight = `${body.scrollHeight}px`;
      }
    }, true);

    new Setting(row)
      .setName("Name")
      .addText((text) => {
        text.setValue(column.name);
        text.inputEl.addEventListener("blur", async () => {
          column.name = text.getValue().trim() || column.name;
          await this.plugin.updateColumns(this.plugin.dashboard.columns);
          this.display();
        });
      });

    if (isManualColumn(column)) {
      new Setting(row)
        .setName("Tag")
        .setDesc("Use one Markdown tag, for example #high-priority.")
        .addText((text) => {
          text.setValue(column.categoryTag);
          text.inputEl.addEventListener("blur", async () => {
            const tag = normalizeTag(text.getValue());
            if (!tag || tag === column.categoryTag) return;
            await this.plugin.updateColumnTag(column.id, tag);
            this.display();
          });
        });
    } else {
      new Setting(row)
        .setName("Smart view")
        .setDesc(column.smartType === "deadline" ? "Shows incomplete tasks with due dates, sorted by the nearest date." : "Automatic column.");
    }

    new Setting(row)
      .setName("Layout")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("primary", "Top")
          .addOption("secondary", "Bottom")
          .setValue(column.layoutGroup || "secondary")
          .onChange(async (value) => {
            column.layoutGroup = value;
            await this.plugin.updateColumns(this.plugin.dashboard.columns);
            this.display();
          });
      });

    const actions = new Setting(row).setName("Actions");
    actions.addButton((button) => {
      button
        .setButtonText("Up")
        .setDisabled(index === 0)
        .onClick(async () => {
          const columns = this.plugin.dashboard.columns.slice();
          [columns[index - 1], columns[index]] = [columns[index], columns[index - 1]];
          await this.plugin.updateColumns(columns);
          this.display();
        });
    });
    actions.addButton((button) => {
      button
        .setButtonText("Down")
        .setDisabled(index === this.plugin.dashboard.columns.length - 1)
        .onClick(async () => {
          const columns = this.plugin.dashboard.columns.slice();
          [columns[index], columns[index + 1]] = [columns[index + 1], columns[index]];
          await this.plugin.updateColumns(columns);
          this.display();
        });
    });

    const deleteSetting = new Setting(row).setName("Delete");
    if (isManualColumn(column)) {
      let targetId = this.plugin.getColumnOptions(column.id)[0]?.id || "";
      deleteSetting.addDropdown((dropdown) => {
        for (const option of this.plugin.getColumnOptions(column.id)) {
          dropdown.addOption(option.id, option.name);
        }
        dropdown.setValue(targetId);
        dropdown.onChange((value) => {
          targetId = value;
        });
      });
      deleteSetting.addButton((button) => {
        button
          .setButtonText("Delete and move tasks")
          .setWarning()
          .setDisabled(!targetId)
          .onClick(async () => {
            await this.plugin.deleteColumn(column.id, targetId);
            this.display();
          });
      });
    } else {
      deleteSetting.addButton((button) => {
        button
          .setButtonText("Delete smart view")
          .setWarning()
          .onClick(async () => {
            await this.plugin.deleteColumn(column.id, "");
            this.display();
          });
      });
    }
  }
}

module.exports = {
  TaskBoardSettingTab
};
