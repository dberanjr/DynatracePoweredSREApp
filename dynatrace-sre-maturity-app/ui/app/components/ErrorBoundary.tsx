import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { Surface } from "@dynatrace/strato-components-preview/layouts";

interface Props {
  children: React.ReactNode;
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
