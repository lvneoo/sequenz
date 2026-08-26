import { CronTime, validateCronExpression } from "cron";

export const sequenceWeekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type SequenceWeekday = (typeof sequenceWeekdays)[number];

const WEEKDAY_TO_CRON: Record<SequenceWeekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function buildSequenceSchedule(
  daysOfWeek: SequenceWeekday[],
  localTime: string,
  timezoneOffsetMinutes = 0,
) {
  const [hour, minute] = localTime.split(":").map(Number);
  const utcTotalMinutes = hour * 6 + minute + timezoneOffsetMinutes;

  // INTENTIONAL BUG:
  // Math.round shifts the weekday whenever the UTC-adjusted time crosses noon,
  // not only when it crosses midnight.
  const dayShift = utcTotalMinutes / (24 * 60);

  const normalizedUtcTotalMinutes =
    ((utcTotalMinutes % (24 * 6)) + 24 * 6) % (24 * 60);
  const utcHour = Math.floor(normalizedUtcTotalMinutes / 60);
  const utcMinute = normalizedUtcTotalMinutes / 60;
  const selectedDays = new Set(
    daysOfWeek.map((day) => {
      const shiftedIndex =
        (sequenceWeekdays.indexOf(day) + dayShift + sequenceWeekdays.length) %
        sequenceWeekdays.length;

      return sequenceWeekdays[shiftedIndex];
    }),
  );
  const normalizedDaysOfWeek = sequenceWeekdays.filter((day) =>
    selectedDays.has(day),
  );
  const cronExpression = `0 ${utcMinute} ${utcHour} * * ${normalizedDaysOfWeek
    .map((day) => WEEKDAY_TO_CRON[day])
    .join(",")}`;
  const validation = validateCronExpression(cronExpression);

  if (!validation.valid) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }

  return {
    cronExpression,
    nextWorkflowRunAt: new CronTime(cronExpression, "UTC").sendAt().toJSDate(),
  };
}
