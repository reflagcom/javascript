# Reflag Feedback UI

The Reflag Browser SDK includes a UI you can use to collect feedback from user
about particular flags.

![image](https://github.com/reflagcom/javascript/assets/34348/c387bac1-f2e2-4efd-9dda-5030d76f9532)

## Global feedback configuration

The Reflag Browser SDK feedback UI is configured with reasonable defaults,
positioning itself as a [dialog](#dialog) in the lower right-hand corner of
the viewport, displayed in English, and with a [light-mode theme](#custom-styling).

These settings can be overwritten when initializing the Reflag Browser SDK:

```typescript
const reflag = new ReflagClient({
  publishableKey: "reflag-publishable-key",
  user: { id: "42" },
  feedback: {
    ui: {
      position: POSITION_CONFIG, // See positioning section
      translations: TRANSLATION_KEYS, // See internationalization section

      // Enable automated feedback surveys. Default: `true`
      enableAutoFeedback: boolean,

      /**
       * Do your own feedback prompt handling or override
       * default settings at runtime.
       */
      autoFeedbackHandler: (promptMessage, handlers) => {
        // See Automated Feedback Surveys section
      },
    },
  },
});
```

See also:

- [Positioning and behavior](#positioning-and-behavior) for the position option,
- [Static language configuration](#static-language-configuration) if you want to translate the feedback UI,
- [Automated feedback surveys](#automated-feedback-surveys) to override default configuration.

## Automated feedback surveys

Automated feedback surveys are enabled by default.

When automated feedback surveys are enabled, the Reflag Browser SDK
will open and maintain a connection to the Reflag service. When a user
triggers an event tracked by a flag and is eligible to be prompted
for feedback, the Reflag service will send a request to the SDK instance.
By default, this request will open up the Reflag feedback UI in the user's
browser, but you can intercept the request and override this behavior.

The live connection for automated feedback is established when the
`ReflagClient` is initialized.

### Disabling automated feedback surveys

You can disable automated collection in the `ReflagClient` constructor:

```typescript
const reflag = new ReflagClient({
  publishableKey: "reflag-publishable-key",
  user: { id: "42" },
  feedback: {
    enableAutoFeedback: false,
  },
});
```

### Overriding prompt event defaults

If you are not satisfied with the default UI behavior when an automated prompt
event arrives, you can can [override the global defaults](#global-feedback-configuration)
or intercept and override settings at runtime like this:

```javascript
const reflag = new ReflagClient({
  publishableKey: "reflag-publishable-key",
  user: { id: "42" },
  feedback: {
    autoFeedbackHandler: (promptMessage, handlers) => {
      // Pass your overrides here. Everything is optional
      handlers.openFeedbackForm({
        title: promptMessage.question,

        position: POSITION_CONFIG, // See positioning section
        translations: TRANSLATION_KEYS, // See internationalization section

        // Trigger side effects with the collected data,
        // for example posting it back into your own CRM
        onAfterSubmit: (feedback) => {
          storeFeedbackInCRM({
            score: feedback.score,
            comment: feedback.comment,
          });
        },
      });
    },
  },
});
```

See also:

- [Positioning and behavior](#positioning-and-behavior) for the position option.
- [Runtime language configuration](#runtime-language-configuration) if you want
  to translate the feedback UI.
- [Use your own UI to collect feedback](#using-your-own-ui-to-collect-feedback) if
  the feedback UI doesn't match your design.

## Manual feedback collection

To open up the feedback collection UI, call `reflagClient.requestFeedback(options)`
with the appropriate options. This approach is particularly beneficial if you wish
to retain manual control over feedback collection from your users while leveraging
the convenience of the Reflag feedback UI to reduce the amount of code you need
to maintain.

Examples of this could be if you want the click of a `give us feedback`-button
or the end of a specific user flow, to trigger a pop-up displaying the feedback
user interface.

### reflagClient.requestFeedback() options

Minimal usage with defaults:

```javascript
reflagClient.requestFeedback({
  flagKey: "reflag-flag-key",
  title: "How satisfied are you with file uploads?",
});
```

All options:

```javascript
reflagClient.requestFeedback({
  flagKey: "reflag-flag-key", // [Required]
  userId: "your-user-id",  // [Optional] if user persistence is
                           // enabled (default in browsers),
  companyId: "users-company-or-account-id", // [Optional]
  title: "How satisfied are you with file uploads?" // [Optional]

  position: POSITION_CONFIG, // [Optional] see the positioning section
  translations: TRANSLATION_KEYS // [Optional] see the internationalization section

  // [Optional] trigger side effects with the collected data,
  // for example sending the feedback to your own CRM
  onAfterSubmit: (feedback) => {
    storeFeedbackInCRM({
      score: feedback.score,
      comment: feedback.comment
    })
  }
})
```

See also:

- [Positioning and behavior](#positioning-and-behavior) for the position option.
- [Runtime language configuration](#runtime-language-configuration) if
  you want to translate the feedback UI.

## Positioning and behavior

The feedback UI can be configured to be placed and behave in 3 different ways:

### Positioning configuration

#### Modal

A modal overlay with a backdrop that blocks interaction with the underlying
page. It can be dismissed with the keyboard shortcut `<ESC>` or the dedicated
close button in the top right corner. It is always centered on the page, capturing
focus, and making it the primary interface the user needs to interact with.

![image](https://github.com/reflagcom/javascript/assets/331790/6c6efbd3-cf7d-4d5b-b126-7ac978b2e512)

Using a modal is the strongest possible push for feedback. You are interrupting the
user's normal flow, which can cause annoyance. A good use-case for the modal is
when the user finishes a linear flow that they don't perform often, for example
setting up a new account.

```javascript
position: {
  type: "MODAL";
}
```

#### Dialog

A dialog that appears in a specified corner of the viewport, without limiting the
user's interaction with the rest of the page. It can be dismissed with the dedicated
close button, but will automatically disappear after a short time period if the user
does not interact with it.

![image](https://github.com/reflagcom/javascript/assets/331790/30413513-fd5f-4a2c-852a-9b074fa4666c)

Using a dialog is a soft push for feedback. It lets the user continue their work
with a minimal amount of intrusion. The user can opt-in to respond but is not
required to. A good use case for this behavior is when a user uses a flag where
the expected outcome is predictable, possibly because they have used it multiple
times before. For example: Uploading a file, switching to a different view of a
visualization, visiting a specific page, or manipulating some data.

The default feedback UI behavior is a dialog placed in the bottom right corner of
the viewport.

```typescript
position: {
  type: "DIALOG";
  placement: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  offset?: {
    x?: string | number; // e.g. "-5rem", "10px" or 10 (pixels)
    y?: string | number;
  }
}
```

#### Popover

A popover that is anchored relative to a DOM-element (typically a button). It can
be dismissed by clicking outside the popover or by pressing the dedicated close button.

![image](https://github.com/reflagcom/javascript/assets/331790/4c5c5597-9ed3-4d4d-90c0-950926d0d967)

You can use the popover mode to implement your own button to collect feedback manually.

```typescript
type Position = {
  type: "POPOVER";
  anchor: DOMElement;
};
```

Popover feedback button example:

```html
<button id="feedbackButton">Tell us what you think</button>
<script>
  const button = document.getElementById("feedbackButton");
  button.addEventListener("click", (e) => {
    reflagClient.requestFeedback({
      flagKey: "reflag-flag-key",
      userId: "your-user-id",
      title: "How do you like the popover?",
      position: {
        type: "POPOVER",
        anchor: e.currentTarget,
      },
    });
  });
</script>
```

## Internationalization (i18n)

By default, the feedback UI is written in English. However, you can supply your own
translations by passing an object in the options to either or both of the
`new ReflagClient(options)` or `reflagClient.requestFeedback(options)` calls.
These translations will replace the English ones used by the feedback interface.
See examples below.

![image](https://github.com/reflagcom/javascript/assets/331790/68805b38-e9f6-4de5-9f55-188216983e3c)

See [default English localization keys](https://github.com/reflagcom/javascript/tree/main/packages/browser-sdk/src/feedback/ui/config/defaultTranslations.tsx)
for a reference of what translation keys can be supplied.

### Static language configuration

If you know the language at page load, you can configure your translation keys while
initializing the Reflag Browser SDK:

```typescript
new ReflagClient({
  publishableKey: "my-publishable-key",
  feedback: {
    ui: {
      translations: {
        DefaultQuestionLabel:
          "Dans quelle mesure êtes-vous satisfait de cette fonctionnalité ?",
        QuestionPlaceholder:
          "Comment pouvons-nous améliorer cette fonctionnalité ?",
        ScoreStatusDescription: "Choisissez une note et laissez un commentaire",
        ScoreStatusLoading: "Chargement...",
        ScoreStatusReceived: "La note a été reçue !",
        ScoreVeryDissatisfiedLabel: "Très insatisfait",
        ScoreDissatisfiedLabel: "Insatisfait",
        ScoreNeutralLabel: "Neutre",
        ScoreSatisfiedLabel: "Satisfait",
        ScoreVerySatisfiedLabel: "Très satisfait",
        SuccessMessage: "Merci d'avoir envoyé vos commentaires!",
        SendButton: "Envoyer",
      },
    },
  },
});
```

### Runtime language configuration

If you only know the user's language after the page has loaded, you can provide
translations to either the `reflagClient.requestFeedback(options)` call or
the `autoFeedbackHandler` option before the feedback interface opens.
See examples below.

```typescript
reflagClient.requestFeedback({
  ... // Other options
  translations: {
    // your translation keys
  }
})
```

### Translations

When you are collecting feedback through the Reflag automation, you can intercept
the default prompt handling and override the defaults.

If you set the prompt question in the Reflag app to be one of your own translation
keys, you can even get a translated version of the question you want to ask your
customer in the feedback UI.

```javascript
new ReflagClient({
  publishableKey: "reflag-publishable-key",
  feedback: {
    autoFeedbackHandler: (message, handlers) => {
      const translatedQuestion =
        i18nLookup[message.question] ?? message.question;
      handlers.openFeedbackForm({
        title: translatedQuestion,
        translations: {
          // your static translation keys
        },
      });
    },
  },
});
```

## Custom styling

You can adapt parts of the look of the Reflag feedback UI by applying CSS custom
properties to your page in your CSS `:root`-scope.

For example, a dark mode theme might look like this:

![image](https://github.com/reflagcom/javascript/assets/34348/5d579b7b-a830-4530-8b40-864488a8597e)

```css
:root {
  --reflag-feedback-dialog-background-color: #1e1f24;
  --reflag-feedback-dialog-color: rgba(255, 255, 255, 0.92);
  --reflag-feedback-dialog-secondary-color: rgba(255, 255, 255, 0.3);
  --reflag-feedback-dialog-border: rgba(255, 255, 255, 0.16);
  --reflag-feedback-dialog-primary-button-background-color: #655bfa;
  --reflag-feedback-dialog-primary-button-color: white;
  --reflag-feedback-dialog-input-border-color: rgba(255, 255, 255, 0.16);
  --reflag-feedback-dialog-input-focus-border-color: rgba(255, 255, 255, 0.3);
  --reflag-feedback-dialog-error-color: #f56565;

  --reflag-feedback-dialog-rating-1-color: #ed8936;
  --reflag-feedback-dialog-rating-1-background-color: #7b341e;
  --reflag-feedback-dialog-rating-2-color: #dd6b20;
  --reflag-feedback-dialog-rating-2-background-color: #652b19;
  --reflag-feedback-dialog-rating-3-color: #787c91;
  --reflag-feedback-dialog-rating-3-background-color: #3e404c;
  --reflag-feedback-dialog-rating-4-color: #38a169;
  --reflag-feedback-dialog-rating-4-background-color: #1c4532;
  --reflag-feedback-dialog-rating-5-color: #48bb78;
  --reflag-feedback-dialog-rating-5-background-color: #22543d;

  --reflag-feedback-dialog-submitted-check-background-color: #38a169;
  --reflag-feedback-dialog-submitted-check-color: #ffffff;
}
```

Other examples of custom styling can be found in our [development example style-sheet](https://github.com/reflagcom/javascript/tree/main/packages/browser-sdk/src/feedback/ui/index.css).

## Using your own UI to collect feedback

You may have very strict design guidelines for your app and maybe the Reflag feedback
UI doesn't quite work for you. In this case, you can implement your own feedback
collection mechanism, which follows your own design guidelines. This is the data
type you need to collect:

```typescript
type DataToCollect = {
  // Customer satisfaction score
  score?: 1 | 2 | 3 | 4 | 5;

  // The comment.
  comment?: string;
};
```

Either `score` or `comment` must be defined in order to pass validation in the
Reflag API.

### Manual feedback collection with custom UI

Examples of a HTML-form that collects the relevant data can be found
in [feedback.html](https://github.com/reflagcom/javascript/tree/main/packages/browser-sdk/example/feedback/feedback.html) and [feedback.jsx](https://github.com/reflagcom/javascript/tree/main/packages/browser-sdk/example/feedback/Feedback.jsx).

Once you have collected the feedback data, pass it along to `reflagClient.feedback()`:

```javascript
reflagClient.feedback({
  flagKey: "reflag-flag-key",
  userId: "your-user-id",
  score: 5,
  comment: "Best thing I've ever tried!",
});
```

### Intercepting automated feedback survey events

When using automated feedback surveys, the Reflag service will, when specified,
send a feedback prompt message to your user's instance of the Reflag Browser SDK.
This will result in the feedback UI being opened.

You can intercept this behavior and open your own custom feedback collection form:

```typescript
new ReflagClient({
  publishableKey: "reflag-publishable-key",
  feedback: {
    autoFeedbackHandler: async (promptMessage, handlers) => {
      // This opens your custom UI
      customFeedbackCollection({
        // The question configured in the Reflag UI for the flag
        question: promptMessage.question,
        // When the user successfully submits feedback data.
        // Use this instead of `reflagClient.feedback()`, otherwise
        // the feedback prompt handler will keep being called
        // with the same prompt message
        onFeedbackSubmitted: (feedback) => {
          handlers.reply(feedback);
        },
        // When the user closes the custom feedback form
        // without leaving any response.
        // It is important to feed this back, otherwise
        // the feedback prompt handler will keep being called
        // with the same prompt message
        onFeedbackDismissed: () => {
          handlers.reply(null);
        },
      });
    },
  },
});
```
