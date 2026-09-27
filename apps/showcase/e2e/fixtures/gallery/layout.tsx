import { Grid, Split, Stack } from "@plainworks/ui/layout"
import type { ReactElement } from "react"
import { Box, Category, Section } from "./frame"

export function LayoutGroup(): ReactElement {
  return (
    <Category title="Layout">
      <Section name="Stack">
        <Stack gap="sm" className="w-48">
          <Box>Vertical 1</Box>
          <Box>Vertical 2</Box>
          <Box>Vertical 3</Box>
        </Stack>
        <Stack direction="horizontal" gap="md" align="center" wrap>
          <Box>Horizontal 1</Box>
          <Box>Horizontal 2</Box>
          <Box>Horizontal 3</Box>
        </Stack>
      </Section>
      <Section name="Grid">
        <Grid minColumnWidth="10rem" gap="md" className="w-full">
          {Array.from({ length: 6 }, (_, index) => (
            <Box key={index}>Cell {index + 1}</Box>
          ))}
        </Grid>
      </Section>
      <Section name="Split">
        <Split side={<Box>Sidebar</Box>} sideBasis="12rem" gap="md" className="w-full">
          <Box>Main content area</Box>
        </Split>
        <Split side={<Box>End side</Box>} sidePlacement="end" gap="sm" className="w-full">
          <Box>Main (side at end)</Box>
        </Split>
      </Section>
    </Category>
  )
}
