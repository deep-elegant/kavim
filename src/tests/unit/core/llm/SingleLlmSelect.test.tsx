vi.mock("@/components/ui/select", () => {
  const React = require("react");

  const createElement = React.createElement;

  const Select = ({
    children,
    onValueChange: _onValueChange,
    value: _value,
    ...props
  }: any) =>
    createElement("div", { ...props, "data-testid": "select-root" }, children);
  const SelectTrigger = ({ children, ...props }: any) =>
    createElement("div", props, children);
  const SelectContent = ({ children, ...props }: any) =>
    createElement("div", props, children);
  const SelectGroup = ({ children, ...props }: any) =>
    createElement("div", props, children);
  const SelectLabel = ({ children, ...props }: any) =>
    createElement("div", props, children);
  const SelectItem = ({ children, ...props }: any) =>
    createElement("div", { role: "option", ...props }, children);
  const SelectSeparator = (props: any) => createElement("hr", props);
  const SelectValue = ({ placeholder }: any) =>
    createElement("span", null, placeholder ?? null);

  return {
    Select,
    SelectTrigger,
    SelectContent,
    SelectGroup,
    SelectLabel,
    SelectItem,
    SelectSeparator,
    SelectValue,
  };
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FormProvider, useForm } from "react-hook-form";
import type { ReactNode } from "react";
import { AI_MODELS } from "@/core/llm/aiModels";
import { SingleLlmSelect } from "@/core/llm/SingleLlmSelect";
import { resolveModelAvailability } from "@/core/llm/llmAvailability";

vi.mock("@/core/llm/llmAvailability", () => {
  const resolveModelAvailabilityMock = vi.fn();
  return {
    LLM_PROVIDER_KEYS_UPDATED_EVENT: "llm-provider-keys-updated",
    resolveModelAvailability: resolveModelAvailabilityMock,
  };
});

const resolveModelAvailabilityMock =
  resolveModelAvailability as unknown as vi.MockedFunction<
    typeof resolveModelAvailability
  >;

const findModel = (value: string) => {
  const model = AI_MODELS.find((entry) => entry.value === value);
  if (!model) {
    throw new Error(`Model ${value} not found in AI_MODELS`);
  }
  return model;
};

const FormWrapper = ({ children }: { children: ReactNode }) => {
  const methods = useForm({ defaultValues: { model: "chatgpt" } });

  return <FormProvider {...methods}>{children}</FormProvider>;
};

describe("SingleLlmSelect", () => {
  beforeEach(() => {
    resolveModelAvailabilityMock.mockReset();
    resolveModelAvailabilityMock.mockReturnValue([
      { model: findModel("gemini-2-5-flash-image"), isEnabled: true },
      { model: findModel("chatgpt"), isEnabled: true },
      { model: findModel("gpt-5"), isEnabled: false },
    ]);
  });

  it("groups image-only models under an Image Generator label", async () => {
    render(
      <FormWrapper>
        <SingleLlmSelect value="chatgpt" onChange={vi.fn()} />
      </FormWrapper>,
    );

    expect(screen.getByText("Image Generator")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Google: Gemini 2.5 Flash Image" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Requires organization verification"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /OpenAI: GPT-5/ }),
    ).toBeInTheDocument();
  });
});
