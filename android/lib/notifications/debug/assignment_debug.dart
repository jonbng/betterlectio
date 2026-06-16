import 'package:lectio_wrapper/types/assignment.dart';

final debugAssignments = [
  AssignmentRef(
      week: 1,
      team: "",
      title: "Fysik Afl. 1",
      deadline: DateTime.now(),
      studentTime: 2.0,
      status: "",
      awaits: "Lærer",
      absence: "",
      taskNote: "",
      id: "44142"),
  AssignmentRef(
      week: 1,
      team: "",
      title: "Dansk Afl. 3",
      deadline: DateTime.now(),
      studentTime: 2.0,
      status: "",
      awaits: "Lærer",
      absence: "",
      taskNote: "",
      id: "441421442")
];

final debugAssignmentsChanged = debugAssignments
    .map((assignment) => assignment.copyWith(awaits: ""))
    .toList();
