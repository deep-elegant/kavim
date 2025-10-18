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

export const SingleLlmSelect = ({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) => {
    const unrestrictedModels = AI_MODELS.filter(
        (model) => !model.requiresOrganizationVerification,
    );
    const restrictedModels = AI_MODELS.filter(
        (model) => model.requiresOrganizationVerification,
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
