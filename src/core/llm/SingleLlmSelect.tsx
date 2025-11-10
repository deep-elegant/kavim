import React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LLM_PROVIDER_KEYS_UPDATED_EVENT,
  resolveModelAvailability,
} from "@/core/llm/llmAvailability";
import { cn } from "@/utils/tailwind";

const DISABLED_MODEL_TOOLTIP =
  "Add this provider's API key in Settings to enable the model.";

type AvailabilityEntry = ReturnType<typeof resolveModelAvailability>[number];

const reorderByAvailability = (entries: AvailabilityEntry[]) => {
  const enabled = entries.filter((entry) => entry.isEnabled);
  const disabled = entries.filter((entry) => !entry.isEnabled);
  return [...enabled, ...disabled];
};

/**
 * Dropdown selector for AI models.
 * - Promotes models with configured API keys to the top of each section.
 * - Disabled entries stay visible with guidance on how to enable them.
 * - Integrates with react-hook-form via FormControl for validation.
 */
export const SingleLlmSelect = ({
  value,
  onChange,
  triggerClassName,
  contentClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  triggerClassName?: string;
  contentClassName?: string;
}) => {
  const [refreshState, setRefreshState] = React.useState(0);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleAvailabilityRefresh = () => {
      setRefreshState((previous) => previous + 1);
    };

    window.addEventListener(
      LLM_PROVIDER_KEYS_UPDATED_EVENT,
      handleAvailabilityRefresh,
    );

    return () => {
      window.removeEventListener(
        LLM_PROVIDER_KEYS_UPDATED_EVENT,
        handleAvailabilityRefresh,
      );
    };
  }, []);

  const availability = React.useMemo(
    () => resolveModelAvailability(),
    [refreshState],
  );

  const { imageGenerators, unrestricted, restricted } = React.useMemo(() => {
    const imageGeneratorEntries: AvailabilityEntry[] = [];
    const unrestrictedEntries: AvailabilityEntry[] = [];
    const restrictedEntries: AvailabilityEntry[] = [];

    for (const entry of availability) {
      const outputCapabilities = entry.model.capabilities?.output ?? ["text"];
      const hasImageOutput = outputCapabilities.includes("image");

      if (hasImageOutput) {
        imageGeneratorEntries.push(entry);
        continue;
      }

      if (entry.model.requiresOrganizationVerification) {
        restrictedEntries.push(entry);
      } else {
        unrestrictedEntries.push(entry);
      }
    }

    return {
      imageGenerators: reorderByAvailability(imageGeneratorEntries),
      unrestricted: reorderByAvailability(unrestrictedEntries),
      restricted: reorderByAvailability(restrictedEntries),
    };
  }, [availability]);

  const renderOption = (entry: AvailabilityEntry) => {
    const { model, isEnabled } = entry;

    return (
      <SelectItem
        key={model.value}
        value={model.value}
        onSelect={
          isEnabled
            ? undefined
            : (event) => {
                event.preventDefault();
              }
        }
        aria-disabled={!isEnabled}
        title={isEnabled ? undefined : DISABLED_MODEL_TOOLTIP}
        className={cn(
          !isEnabled &&
            "text-slate-400 !cursor-not-allowed hover:bg-transparent focus:bg-transparent data-[highlighted]:bg-transparent data-[highlighted]:text-slate-400 data-[state=checked]:bg-transparent data-[state=checked]:text-slate-400",
        )}
      >
        <div className="flex flex-col">
          <span>{model.label}</span>
          {!isEnabled ? (
            <span className="text-[11px] font-normal text-slate-500">
              Configure the API key in Settings to enable this model.
            </span>
          ) : null}
        </div>
      </SelectItem>
    );
  };

  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger className={cn("w-full", triggerClassName)}>
        <SelectValue placeholder="Select llm" />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {unrestricted.map(renderOption)}
        {/** Models that you use to generate Images */}
        {imageGenerators.length > 0 ? (
          <>
            {(unrestricted.length > 0 || restricted.length > 0) && (
              <SelectSeparator />
            )}
            <SelectGroup>
              <SelectLabel>Image Generator</SelectLabel>
              {imageGenerators.map(renderOption)}
            </SelectGroup>
          </>
        ) : null}
        {/* Visually separate restricted models to set clear expectations */}
        {restricted.length > 0 && (
          <>
            {unrestricted.length > 0 && <SelectSeparator />}
            <SelectGroup>
              <SelectLabel>Requires organization verification</SelectLabel>
              {restricted.map(renderOption)}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  );
};
