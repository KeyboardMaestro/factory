"use client";

import { useState, type KeyboardEvent } from "react";
import type { CustomTag } from "@/lib/domain";
import { makeCustomTag, normalizeTagText, resolveTagInput, tagLabel } from "@/lib/tags";

interface TagPickerProps<T extends string> {
  inputId: string;
  inputLabel: string;
  placeholder: string;
  values: readonly T[];
  labels: Readonly<Record<T, string>>;
  suggested: readonly string[];
  selected: readonly (T | CustomTag)[];
  onSelectionChange: (values: (T | CustomTag)[]) => void;
  onError: (message: string) => void;
}

export function TagPicker<T extends string>({
  inputId, inputLabel, placeholder, values, labels, suggested, selected, onSelectionChange, onError,
}: TagPickerProps<T>) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeTagText(query);
  const catalog: Array<{ value: T | CustomTag; label: string }> = values.map((value) => ({ value, label: labels[value] }));
  for (const label of suggested) {
    const value = makeCustomTag(label);
    if (value) catalog.push({ value, label });
  }
  const matches = normalizedQuery
    ? catalog.filter(({ value, label }) => !selected.includes(value)
      && normalizeTagText(label).includes(normalizedQuery)).slice(0, 5)
    : [];

  function select(value: T | CustomTag) {
    if (selected.includes(value)) {
      onError("이미 선택한 항목이에요.");
      return;
    }
    if (selected.length >= 3) {
      onError("최대 3개까지 고를 수 있어요.");
      return;
    }
    onSelectionChange([...selected, value]);
    setQuery("");
    onError("");
  }

  function addTyped(raw = query) {
    if (!raw.trim()) return;
    const value = resolveTagInput(raw, values, labels);
    if (!value) {
      onError("항목은 1~20자로 입력해주세요. 한글·영문·숫자와 일부 기호만 사용할 수 있어요.");
      return false;
    }
    if (selected.includes(value)) {
      onError("이미 선택한 항목이에요.");
      return false;
    }
    if (selected.length >= 3) {
      onError("최대 3개까지 고를 수 있어요. 칩을 지우고 다시 입력해주세요.");
      return false;
    }
    onSelectionChange([...selected, value]);
    onError("");
    return true;
  }

  function handleInputChange(raw: string) {
    const parts = raw.split(/[,，、\n]+/u);
    if (parts.length === 1) {
      setQuery(raw);
      onError("");
      return;
    }

    const completed = parts.slice(0, -1);
    const remainder = parts.at(-1) ?? "";
    const nextSelected = [...selected];
    let error = "";
    let failedIndex = completed.length;

    for (let index = 0; index < completed.length; index += 1) {
      const token = completed[index].trim();
      if (!token) continue;
      const value = resolveTagInput(token, values, labels);
      if (!value) {
        error = "항목은 1~20자로 입력해주세요. 한글·영문·숫자와 일부 기호만 사용할 수 있어요.";
        failedIndex = index;
        break;
      }
      if (nextSelected.includes(value)) {
        error = "이미 선택한 항목이에요.";
        failedIndex = index;
        break;
      }
      if (nextSelected.length >= 3) {
        error = "최대 3개까지 고를 수 있어요. 칩을 지우고 다시 입력해주세요.";
        failedIndex = index;
        break;
      }
      nextSelected.push(value);
    }

    if (nextSelected.length !== selected.length) onSelectionChange(nextSelected);
    setQuery(error ? [...completed.slice(failedIndex), remainder].join(", ") : remainder);
    onError(error);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (addTyped()) setQuery("");
    } else if (event.key === "Escape") {
      setQuery("");
    }
  }

  const customSelected = selected.filter((value) => value.startsWith("custom:"));

  return <div className="tag-selection">
    <div className="tag-picker" role="group" aria-label="기본 선택 항목">
      {values.map((value) => <button key={value} type="button"
        className={`choice-button tag-choice${selected.includes(value) ? " is-selected" : ""}`}
        aria-pressed={selected.includes(value)}
        onClick={() => {
          if (selected.includes(value)) {
            onSelectionChange(selected.filter((item) => item !== value));
            onError("");
          } else select(value);
        }}>{labels[value]}</button>)}
    </div>
    <div className="tag-entry">
      <label className="field-label" htmlFor={inputId}>{inputLabel}</label>
      <div className="tag-entry-row" role="group" aria-label={`${inputLabel} 칩 입력`}>
        {customSelected.map((value) => <button key={value} type="button"
          className="custom-selected-chip"
          aria-label={`${tagLabel(value, labels)} 선택 해제`}
          onClick={() => { onSelectionChange(selected.filter((item) => item !== value)); onError(""); }}>
          {tagLabel(value, labels)} <span aria-hidden="true">×</span>
        </button>)}
        <input id={inputId} type="text" value={query} maxLength={100} autoComplete="off"
          placeholder={placeholder} onChange={(event) => handleInputChange(event.target.value)}
          onKeyDown={handleKeyDown} aria-describedby={`${inputId}-help`} />
      </div>
      <p id={`${inputId}-help`} className="tag-entry-help">입력 후 Enter 또는 쉼표를 누르면 칩으로 추가돼요. 추천 항목을 터치해도 돼요. {selected.length}/3개</p>
      {matches.length > 0 && <ul className="tag-suggestions" aria-label="자동완성 추천">
        {matches.map(({ value, label }) => <li key={value}><button type="button" onClick={() => select(value)}>
          <span>{label}</span><span aria-hidden="true">＋</span>
        </button></li>)}
      </ul>}
    </div>
  </div>;
}
