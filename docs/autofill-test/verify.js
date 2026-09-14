/*
 * Live pass/fail for each test page.
 *
 * Reading a hidden field's value in the console is a poor instruction: it needs
 * the right console, the right id, and it only tells you about the moment you
 * asked. This watches instead, so the page says whether it passed.
 *
 * Polling rather than listening for `input`: a fill that silently failed to
 * dispatch its events is exactly the bug worth catching, so the check must not
 * depend on those events firing.
 */
(function () {
  var spec = window.PASSIO_TEST || {};
  var mustFill = spec.mustFill || [];
  var mustStayEmpty = spec.mustStayEmpty || [];

  var box = document.createElement("p");
  box.className = "status idle";
  box.textContent = "Waiting — fill this form with passio.";
  document.body.appendChild(box);

  function valueOf(id) {
    var el = document.getElementById(id);
    return el && typeof el.value === "string" ? el.value : "";
  }

  function label(ids) {
    return ids
      .map(function (id) {
        var el = document.getElementById(id);
        return (el && el.getAttribute("data-label")) || id;
      })
      .join(", ");
  }

  function render() {
    var leaked = mustStayEmpty.filter(function (id) {
      return valueOf(id).length > 0;
    });

    if (leaked.length > 0) {
      box.className = "status fail";
      box.textContent =
        "✗ FAIL — " + label(leaked) + " was filled. This is a bug: report it.";
      return;
    }

    var filled = mustFill.filter(function (id) {
      return valueOf(id).length > 0;
    });

    if (mustFill.length === 0) {
      box.className = filled.length === 0 ? "status pass" : "status pass";
      box.textContent =
        "✓ PASS so far — nothing that must stay empty has been filled. " +
        "Try filling from the popup and from the in-field button.";
      return;
    }

    if (filled.length === mustFill.length) {
      box.className = "status pass";
      box.textContent = "✓ PASS — " + label(mustFill) + " filled, nothing else touched.";
    } else if (filled.length > 0) {
      box.className = "status idle";
      box.textContent =
        "Partly filled: " + label(filled) + ". Expected " + label(mustFill) + ".";
    } else {
      box.className = "status idle";
      box.textContent = "Waiting — fill this form with passio.";
    }
  }

  setInterval(render, 250);
  render();
})();
