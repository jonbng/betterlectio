/**
 * Type augmentation to fix Preact/React type compatibility.
 *
 * When using Preact with @types/react (required by shadcn/ui, Radix, etc.),
 * React's `ReactNode` type doesn't accept Preact's `VNode`. This augmentation
 * injects `VNode<any>` into `ReactNode` via the experimental nodes interface,
 * so JSX elements are assignable to React component children props.
 */
import type { VNode } from 'preact';

declare module 'react' {
  interface DO_NOT_USE_OR_YOU_WILL_BE_FIRED_EXPERIMENTAL_REACT_NODES {
    preactVNode: VNode<any>;  // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}
