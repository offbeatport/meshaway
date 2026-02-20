import { Select } from "@base-ui/react/select";

const SELECT_TRIGGER_CLASS =
  "flex h-10 w-full items-center justify-between gap-3 rounded-md border border-zinc-700 bg-zinc-900/80 pr-3 pl-3.5 text-sm text-zinc-100 select-none hover:bg-zinc-800/70 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-sky-500/70 data-[popup-open]:bg-zinc-800/70";
const SELECT_POSITIONER_CLASS = "z-50 outline-none select-none";
const SELECT_POPUP_CLASS =
  "group min-w-[var(--anchor-width)] origin-[var(--transform-origin)] rounded-md bg-zinc-900 text-zinc-100 shadow-xl shadow-black/30 outline outline-1 outline-zinc-800 transition-[transform,scale,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[side=none]:min-w-[calc(var(--anchor-width)+1rem)] data-[side=none]:data-[ending-style]:transition-none data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[side=none]:data-[starting-style]:scale-100 data-[side=none]:data-[starting-style]:opacity-100 data-[side=none]:data-[starting-style]:transition-none";
const SELECT_LIST_CLASS = "relative py-1 overflow-y-auto max-h-[var(--available-height)]";
const SELECT_ITEM_CLASS =
  "grid cursor-default grid-cols-[0.75rem_1fr] items-center gap-2 py-2 pr-4 pl-2.5 text-sm leading-4 outline-none select-none group-data-[side=none]:pr-12 data-[highlighted]:relative data-[highlighted]:z-0 data-[highlighted]:text-white data-[highlighted]:before:absolute data-[highlighted]:before:inset-x-1 data-[highlighted]:before:inset-y-0 data-[highlighted]:before:z-[-1] data-[highlighted]:before:rounded-sm data-[highlighted]:before:bg-sky-600/70";
const SELECT_ITEM_TEXT_CLASS = "col-start-2";

function ChevronUpDownIcon() {
  return (
    <svg
      width="8"
      height="12"
      viewBox="0 0 8 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M0.5 4.5L4 1.5L7.5 4.5" />
      <path d="M0.5 7.5L4 10.5L7.5 7.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg fill="currentColor" width="10" height="10" viewBox="0 0 10 10">
      <path d="M9.1603 1.12218C9.50684 1.34873 9.60427 1.81354 9.37792 2.16038L5.13603 8.66012C5.01614 8.8438 4.82192 8.96576 4.60451 8.99384C4.3871 9.02194 4.1683 8.95335 4.00574 8.80615L1.24664 6.30769C0.939709 6.02975 0.916013 5.55541 1.19372 5.24822C1.47142 4.94102 1.94536 4.91731 2.2523 5.19524L4.36085 7.10461L8.12299 1.33999C8.34934 0.993152 8.81376 0.895638 9.1603 1.12218Z" />
    </svg>
  );
}

export interface AppSelectItem<T> {
  value: T;
  label: string;
  /** Mute a prefix of the label (prefix shown in zinc-500, rest normal). */
  mutedPrefix?: string;
  selectedPrefix?: string;
  /** Mute only this substring in the label (e.g. "acp: "). Rest of label stays normal. */
  mutedSegment?: string;
}

export interface AppSelectProps<T> {
  value: T;
  onValueChange: (value: T) => void;
  items: AppSelectItem<T>[];
  placeholder?: string;
}

export function AppSelect<T extends string>({
  value,
  onValueChange,
  items,
  placeholder = "Select…",
}: AppSelectProps<T>) {
  return (
    <Select.Root<T>
      value={value}
      onValueChange={(v) => {
        if (v != null) onValueChange(v);
      }}
      items={items}
    >
      <Select.Trigger className={SELECT_TRIGGER_CLASS}>
        <Select.Value
          className="min-w-0 flex-1 truncate text-left data-[placeholder]:opacity-60"
          placeholder={placeholder}
        >
          {(selectedValue: T | null) => {
            const selected = selectedValue
              ? items.find((item) => item.value === selectedValue)
              : undefined;
            if (!selected) return undefined;
            if (selected.mutedSegment && selected.label.includes(selected.mutedSegment)) {
              const i = selected.label.indexOf(selected.mutedSegment);
              const before = selected.label.slice(0, i);
              const after = selected.label.slice(i + selected.mutedSegment.length);
              return (
                <>
                  {before}
                  <span className="text-zinc-500">{selected.mutedSegment}</span>
                  {after}
                </>
              );
            }
            if (selected.mutedPrefix && selected.label.startsWith(selected.mutedPrefix)) {
              const selectedPrefix = selected.selectedPrefix ?? selected.mutedPrefix;
              return (
                <>
                  <span className="text-zinc-500">{selectedPrefix}</span>
                  {selected.label.slice(selected.mutedPrefix.length)}
                </>
              );
            }
            return selected.label;
          }}
        </Select.Value>
        <Select.Icon className="flex shrink-0 text-zinc-500">
          <ChevronUpDownIcon />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className={SELECT_POSITIONER_CLASS} sideOffset={8}>
          <Select.Popup className={SELECT_POPUP_CLASS}>
            <Select.ScrollUpArrow className="top-0 z-[1] flex h-4 w-full cursor-default items-center justify-center rounded-md bg-zinc-900 text-center text-xs before:absolute data-[side=none]:before:top-[-100%] before:left-0 before:h-full before:w-full before:content-['']" />
            <Select.List className={SELECT_LIST_CLASS}>
              {items.map(({ value: itemValue, label, mutedPrefix, mutedSegment }) => (
                <Select.Item
                  key={String(itemValue)}
                  value={itemValue}
                  className={SELECT_ITEM_CLASS}
                >
                  <Select.ItemIndicator className="col-start-1">
                    <CheckIcon />
                  </Select.ItemIndicator>
                  <Select.ItemText className={SELECT_ITEM_TEXT_CLASS}>
                    {mutedSegment && label.includes(mutedSegment) ? (
                      (() => {
                        const i = label.indexOf(mutedSegment);
                        const before = label.slice(0, i);
                        const after = label.slice(i + mutedSegment.length);
                        return (
                          <>
                            {before}
                            <span className="text-zinc-500">{mutedSegment}</span>
                            {after}
                          </>
                        );
                      })()
                    ) : mutedPrefix && label.startsWith(mutedPrefix) ? (
                      <>
                        <span className="text-zinc-500">{mutedPrefix}</span>
                        {label.slice(mutedPrefix.length)}
                      </>
                    ) : (
                      label
                    )}
                  </Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
            <Select.ScrollDownArrow className="bottom-0 z-[1] flex h-4 w-full cursor-default items-center justify-center rounded-md bg-zinc-900 text-center text-xs before:absolute before:left-0 before:h-full before:w-full before:content-[''] data-[side=none]:before:bottom-[-100%]" />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
