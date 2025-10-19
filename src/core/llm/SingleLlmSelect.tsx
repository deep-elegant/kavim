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
import { FormControl } from "@/components/ui/form";
import { AI_MODELS } from "@/core/llm/aiModels";

/**
 * Dropdown selector for AI models.
 * - Separates models requiring organization verification
 * - Integrates with react-hook-form via FormControl
 */
export const SingleLlmSelect = ({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) => {
    // Split models into verified and unverified for UI grouping
    const unrestrictedModels = AI_MODELS.filter(
        (model) => !(model as any).requiresOrganizationVerification,
    );
    const restrictedModels = AI_MODELS.filter(
        (model) => (model as any).requiresOrganizationVerification,
    );

    return (
        <Select
            onValueChange={onChange}
            value={value}
        >
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
                {/* Show verification requirement as separate group */}
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
