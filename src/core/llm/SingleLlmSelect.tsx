import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormControl } from "@/components/ui/form";
import { AI_MODELS } from "@/core/llm/aiModels";

export const SingleLlmSelect = ({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) => {
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
                {AI_MODELS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};
