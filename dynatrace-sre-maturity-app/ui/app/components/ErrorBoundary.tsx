import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { Surface } from "@dynatrace/strato-components-preview/layouts";

interface Props {
  children: React.ReactNode;
  /** Renders a small inline fallback instead of a full-page Surface card —
   * for boundaries scoped around one widget, where a page-sized "something
   * went wrong" card would be disproportionate and take out unrelated content. */
  compact?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.compact) {
        return (
          <Flex
            flexDirection="column"
            gap={4}
            style={{ padding: 16, border: "1px solid var(--dt-colors-border-neutral-default, rgba(0,0,0,0.12))", borderRadius: 8 }}
          >
            <Paragraph style={{ color: "var(--dt-colors-text-critical-default)", fontSize: 12, fontWeight: 600 }}>
              Couldn't render this view: {this.state.error?.message || "an unexpected error occurred"}
            </Paragraph>
            <Paragraph style={{ fontSize: 12, color: "var(--sre-text-secondary)" }}>
              Try a different layout, level, or view mode.
            </Paragraph>
          </Flex>
        );
      }
      return (
        <Surface padding={32}>
          <Flex flexDirection="column" gap={8}>
            <Heading level={4}>Something went wrong</Heading>
            <Paragraph style={{ color: "var(--dt-colors-text-critical-default)" }}>
              {this.state.error?.message || "An unexpected error occurred."}
            </Paragraph>
            <Paragraph>
              Try selecting a different ApplicationCI or timeframe, or reload the page.
            </Paragraph>
          </Flex>
        </Surface>
      );
    }

    return this.props.children;
  }
}
