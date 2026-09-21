import { fireEvent, render, screen } from "@testing-library/react";
import {
  CJRouterMessage,
  parseCJFooter,
  stripModelSourceSection,
} from "../CJRouterFooter";
import TextPart from "../Parts/Text";

jest.mock("../Markdown", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));
jest.mock("../MarkdownLite", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));
jest.mock("../Parts/CollapsibleText", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("~/hooks", () => ({ useLocalize: () => () => "Sources" }));
jest.mock("~/hooks/Messages/useSmoothStreaming", () => ({
  __esModule: true,
  default: () => false,
}));
jest.mock("~/Providers", () => ({
  useMessageContext: () => ({ isSubmitting: false, isLatestMessage: true }),
}));
jest.mock("recoil", () => ({ useRecoilValue: () => false }));
jest.mock("~/store", () => ({ __esModule: true, default: {} }));
jest.mock("~/utils", () => ({
  cn: (...values: string[]) => values.filter(Boolean).join(" "),
}));

const answer = "The answer [1].";
const bibliography =
  "\n\n[1] Wikipedia (SECONDARY)\n\nSources:\n1. https://example.com";
const sources =
  "CJ Router sources relied upon:\n1. SECONDARY: [Film](https://example.com) (search rank 1)";
const stats = "---\n\n_CJ Router: Model: local | Time: 26.9s_";
const content = `${answer}${bibliography}\n\n${sources}\n\n${stats}`;

test("both renderers show a collapsed source list and visible stats", () => {
  for (const element of [
    <CJRouterMessage content={content} isLatestMessage />,
    <TextPart text={content} isCreatedByUser={false} showCursor={false} />,
  ]) {
    const view = render(element);
    expect(screen.getByText(answer)).toBeInTheDocument();
    expect(screen.queryByText(/Wikipedia/)).not.toBeInTheDocument();
    expect(screen.getByText(/CJ Router: Model:/)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Sources (1)" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText(/CJ Router sources relied upon:/),
    ).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText(/CJ Router sources relied upon:/),
    ).toBeInTheDocument();
    fireEvent.click(button);
    expect(
      screen.queryByText(/CJ Router sources relied upon:/),
    ).not.toBeInTheDocument();
    view.unmount();
  }
});

test("handles stats alone, CRLF, and sources arriving before stats", () => {
  expect(parseCJFooter(`${answer}\r\n${stats.replace(/\n/g, "\r\n")}`)).toEqual(
    { mainText: answer, sourcesText: "", footerText: stats },
  );
  expect(parseCJFooter(`${answer}\n${sources}`)).toEqual({
    mainText: answer,
    sourcesText: sources,
    footerText: "",
  });
  expect(parseCJFooter(answer)).toBeNull();
});

test("does not strip source lists from stats-only messages", () => {
  render(
    <CJRouterMessage
      content={`${answer}${bibliography}\n\n${stats}`}
      isLatestMessage
    />,
  );
  expect(document.body.textContent).toContain("[1] Wikipedia (SECONDARY)");
  expect(document.body.textContent).toContain(
    "Sources:\n1. https://example.com",
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByText(/CJ Router: Model:/)).toBeInTheDocument();
});

test("does not transform user messages", () => {
  render(<TextPart text={content} isCreatedByUser showCursor={false} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByText(/Wikipedia/)).toBeInTheDocument();
});

test("strips only trailing source lists and preserves prose, citations, and fenced code", () => {
  expect(stripModelSourceSection(answer + bibliography)).toBe(answer);
  expect(
    stripModelSourceSection(
      answer + "\n**Sources:**\n- [Film](https://example.com)",
    ),
  ).toBe(answer);
  expect(
    stripModelSourceSection(answer + "\nSources: [1] https://example.com"),
  ).toBe(answer);
  for (const suffix of [
    "\nSources of uncertainty include sampling.",
    "\nSources:\nKeep this explanation.",
    "\n```\nSources:\n1. https://example.com\n```",
    "\n[1] A claim.\n\nMore answer.",
    "\n\n6-17. Additional steps are explained above.",
    "\n\n1. Winner - explanation\n2. Second - explanation",
  ]) {
    expect(stripModelSourceSection(answer + suffix)).toBe(answer + suffix);
  }
});

test("strips the trailing unheaded source range emitted by local models", () => {
  const leakedBibliography = [
    "The answer keeps its final evidence note.",
    "",
    "6-17. Additional secondary and weak sources as listed in the evidence",
    "",
    '[13] Variety - "The Odyssey Is Christopher Nolan\'s Highest-Grossing Movie Ever"',
    "",
    '[14] Collider - "Christopher Nolan Officially Beats His Own Box Office Record With The Odyssey"',
    "",
    "[15] IMDB list - 2026 Highest Grossing Movies Worldwide",
  ].join("\n");

  expect(stripModelSourceSection(leakedBibliography)).toBe(
    "The answer keeps its final evidence note.",
  );
});

test("keeps a summary following a model bibliography without URLs", () => {
  expect(
    stripModelSourceSection(
      answer +
        "\n\nSources:\n[1] Wikipedia - Film\n[2] Box Office Mojo\n\nFinal answer: Keep this summary.",
    ),
  ).toBe(answer + "\n\nFinal answer: Keep this summary.");
});
