/**
 * Puts a value into an input so that React and friends actually notice.
 *
 * `el.value = x` does not work on a React-controlled input. React installs its
 * own `value` accessor on the element and uses it to track what it has already
 * seen, so a direct assignment is recorded as "no change" and gets overwritten
 * on the next render. Writing through the prototype's native setter bypasses
 * that tracker, and the events below then tell the framework something changed.
 *
 * Half the web is React. This is not an edge case.
 */
export function fillField(el: HTMLInputElement | null, value: string): void {
  if (!el) return;

  el.focus();

  // Typed as a property holding a function rather than through
  // PropertyDescriptor, whose `set` is declared with method shorthand. The
  // explicit `this` says what the slot really is: a setter meant to be borrowed
  // from the prototype and applied to one element, which is sound, rather than
  // a method accidentally detached from its object, which is not.
  const descriptor: { set?: (this: HTMLInputElement, v: string) => void } | undefined =
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  const native = descriptor?.set;

  // Reflect.apply supplies the receiver explicitly and is typed for exactly
  // this borrow-and-apply shape.
  if (native) Reflect.apply(native, el, [value]);
  else el.value = value;

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
