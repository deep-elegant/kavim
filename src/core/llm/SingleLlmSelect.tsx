import React, { useMemo } from "react";
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
import { FormControl } from "@/components/ui/form";
import { AI_MODELS } from "@/core/llm/aiModels";

/**
 * Dropdown selector for AI models.
 * - Separates models requiring organization verification (beta access, etc.).
 * - Integrates with react-hook-form via FormControl for validation.
 */
export const SingleLlmSelect = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => {
  // Split models by access level (general availability vs. org-verified beta)
  const unrestrictedModels = useMemo(
    () => AI_MODELS.filter((model) => !model.requiresOrganizationVerification),
    [],
  );
  const restrictedModels = useMemo(
    () =>
      AI_MODELS.filter(
        (model) => model.requiresOrganizationVerification === true,
      ),
    [],
  );

  return (
    <Select onValueChange={onChange} value={value}>
      <FormControl>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select llm" />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {unrestrictedModels.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
        {/* Visually separate restricted models to set clear expectations */}
        {restrictedModels.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Requires organization verification</SelectLabel>
              {restrictedModels.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label} (requires organization verification)
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  );
};
