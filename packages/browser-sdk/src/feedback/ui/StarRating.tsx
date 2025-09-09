import { Fragment, FunctionComponent, h } from "preact";
import { useRef } from "preact/hooks";

import { Dissatisfied } from "../../ui/icons/Dissatisfied";
import { Neutral } from "../../ui/icons/Neutral";
import { Satisfied } from "../../ui/icons/Satisfied";
import { VeryDissatisfied } from "../../ui/icons/VeryDissatisfied";
import { VerySatisfied } from "../../ui/icons/VerySatisfied";
import {
  arrow,
  offset,
  useFloating,
} from "../../ui/packages/floating-ui-preact-dom";

import { FeedbackTranslations } from "./types";

const scores = [
  {
    color: "var(--reflag-feedback-dialog-rating-1-color, #dd6b20)",
    bg: "var(--reflag-feedback-dialog-rating-1-background-color, #fbd38d)",
    icon: <VeryDissatisfied />,
    getLabel: (t: FeedbackTranslations) => t.ScoreVeryDissatisfiedLabel,
    value: 1,
  },
  {
    color: "var(--reflag-feedback-dialog-rating-2-color, #ed8936)",
    bg: "var(--reflag-feedback-dialog-rating-2-background-color, #feebc8)",
    icon: <Dissatisfied />,
    getLabel: (t: FeedbackTranslations) => t.ScoreDissatisfiedLabel,
    value: 2,
  },
  {
    color: "var(--reflag-feedback-dialog-rating-3-color, #787c91)",
    bg: "var(--reflag-feedback-dialog-rating-3-background-color, #e9e9ed)",
    icon: <Neutral />,
    getLabel: (t: FeedbackTranslations) => t.ScoreNeutralLabel,
    value: 3,
  },
  {
    color: "var(--reflag-feedback-dialog-rating-4-color, #48bb78)",
    bg: "var(--reflag-feedback-dialog-rating-4-background-color, #c6f6d5)",
    icon: <Satisfied />,
    getLabel: (t: FeedbackTranslations) => t.ScoreSatisfiedLabel,
    value: 4,
  },
  {
    color: "var(--reflag-feedback-dialog-rating-5-color, #38a169)",
    bg: "var(--reflag-feedback-dialog-rating-5-background-color, #9ae6b4)",
    icon: <VerySatisfied />,
    getLabel: (t: FeedbackTranslations) => t.ScoreVerySatisfiedLabel,
    value: 5,
  },
] as const;

type ScoreNumber = (typeof scores)[number];

export type StarRatingProps = {
  name: string;
  selectedValue?: number;
  onChange?: h.JSX.GenericEventHandler<HTMLInputElement>;
  t: FeedbackTranslations;
};

export const StarRating: FunctionComponent<StarRatingProps> = ({
  t,
  name,
  selectedValue,
  onChange,
}) => {
  return (
    <div class="star-rating">
      <style>
        {scores.map(
          ({ bg, color }, index) => `
            .star-rating-icons > input:nth-of-type(${
              index + 1
            }):checked + .button {
              border-color: ${color};
            }

            .star-rating-icons > input:nth-of-type(${
              index + 1
            }):checked + .button > div {
              background-color: ${bg};
            }

            .star-rating-icons > input:nth-of-type(${
              index + 1
            }):checked ~ input:nth-of-type(${index + 2}) + .button {
              border-left-color: ${color};
            }
          `,
        )}
      </style>
      <div class="star-rating-icons">
        {scores.map((score) => (
          <Score
            key={score.value}
            isSelected={score.value === selectedValue}
            name={name}
            score={score}
            t={t}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
};

const Score = ({
  isSelected,
  name,
  onChange,
  score,
  t,
}: {
  isSelected: boolean;
  name: string;
  onChange?: h.JSX.GenericEventHandler<HTMLInputElement>;
  score: ScoreNumber;
  t: FeedbackTranslations;
}) => {
  const arrowRef = useRef<HTMLDivElement>(null);
  const { refs, floatingStyles, middlewareData } = useFloating({
    placement: "top",
    middleware: [
      offset(4),
      arrow({
        element: arrowRef,
      }),
    ],
  });

  return (
    <>
      <input
        defaultChecked={isSelected}
        id={`reflag-feedback-score-${score.value}`}
        name={name}
        type="radio"
        value={score.value}
        onChange={onChange}
      />
      <label
        ref={refs.setReference}
        aria-label={score.getLabel(t)}
        class="button"
        for={`reflag-feedback-score-${score.value}`}
        style={{ color: score.color }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            opacity: 0.2, // TODO: fix overflow
            zIndex: 1,
          }}
        />
        <span style={{ zIndex: 2, display: "flex", alignItems: "center" }}>
          {score.icon}
        </span>
      </label>
      <div ref={refs.setFloating} class="button-tooltip" style={floatingStyles}>
        {score.getLabel(t)}
        <div
          ref={arrowRef}
          class="button-tooltip-arrow"
          style={{
            left:
              middlewareData.arrow?.x != null
                ? `${middlewareData.arrow.x}px`
                : "",
            top:
              middlewareData.arrow?.y != null
                ? `${middlewareData.arrow.y}px`
                : "",
          }}
        />
      </div>
    </>
  );
};
