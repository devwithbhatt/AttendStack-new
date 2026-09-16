export interface Holiday {
  id: number;
  name: string;
  date: string;
  day: string;
  type: "Public Holiday" | "National Holiday" | "Festival" | "Optional Holiday";
}