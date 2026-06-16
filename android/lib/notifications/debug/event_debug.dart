import 'package:lectio_wrapper/types/weeks/calendar_event.dart';

final debugEvents = [
  CalendarEvent(
      type: CalendarEventType.regular,
      status: "Uændret",
      title: "Dansk",
      team: "da",
      teachers: [],
      room: "",
      id: "314214",
      note: "",
      start: DateTime.now(),
      end: DateTime.now(),
      hasHomework: false,
      hasNote: false,
      teacherObjs: [],
      teamObjs: []),
  CalendarEvent(
      type: CalendarEventType.regular,
      status: "Uændret",
      title: "Fysik",
      team: "fy",
      teachers: [],
      room: "",
      id: "314234114",
      note: "",
      start: DateTime.now(),
      end: DateTime.now(),
      hasHomework: false,
      hasNote: false,
      teacherObjs: [],
      teamObjs: []),
  CalendarEvent(
      type: CalendarEventType.regular,
      status: "Uændret",
      title: "Kemi",
      team: "ke",
      teachers: [],
      room: "",
      id: "314213434114",
      note: "",
      start: DateTime.now(),
      end: DateTime.now(),
      hasHomework: false,
      hasNote: false,
      teacherObjs: [],
      teamObjs: [])
];

final debugEventsChanged = [
  CalendarEvent(
      type: CalendarEventType.regular,
      status: "Aflyst!",
      title: "Dansk",
      team: "da",
      teachers: [],
      room: "",
      id: "314214",
      note: "",
      start: DateTime.now(),
      end: DateTime.now(),
      hasHomework: false,
      hasNote: false,
      teacherObjs: [],
      teamObjs: []),
  CalendarEvent(
      type: CalendarEventType.regular,
      status: "Ændret!",
      title: "Fysik",
      team: "fy",
      teachers: [],
      room: "",
      id: "314234114",
      note: "",
      start: DateTime.now(),
      end: DateTime.now(),
      hasHomework: false,
      hasNote: false,
      teacherObjs: [],
      teamObjs: []),
  CalendarEvent(
      type: CalendarEventType.regular,
      status: "Uændret",
      title: "Kemi",
      team: "ke",
      teachers: [],
      room: "",
      id: "314213434114",
      note: "",
      start: DateTime.now(),
      end: DateTime.now(),
      hasHomework: false,
      hasNote: false,
      teacherObjs: [],
      teamObjs: [])
];

final Week debugWeek = Week(
    days: [Day(informations: [], events: debugEvents, date: DateTime.now())],
    weekNum: 1,
    modulRanges: []);
final Week debugWeekChanged = Week(
    days: [
      Day(informations: [], events: debugEventsChanged, date: DateTime.now())
    ],
    weekNum: 1,
    modulRanges: []);
