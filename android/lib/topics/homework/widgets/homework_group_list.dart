import 'package:flutter/material.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:betterlectio/topics/homework/widgets/homework_group.dart';

class HomeworkGroupList extends StatefulWidget {
  const HomeworkGroupList({super.key, required this.homework});

  final List<Homework> homework;

  @override
  State<HomeworkGroupList> createState() => _HomeworkGroupListState();
}

class _HomeworkGroupListState extends State<HomeworkGroupList> {
  Map<DateTime, List<Homework>> daysAndHomework = {};

  void _buildGroups() {
    daysAndHomework = {};
    for (var homework in widget.homework) {
      var match = daysAndHomework.keys
          .where((element) =>
              element.day == homework.dato.day &&
              element.month == homework.dato.month)
          .firstOrNull;
      if (match != null) {
        daysAndHomework[match] = [...daysAndHomework[match]!, homework];
      } else {
        daysAndHomework.putIfAbsent(homework.dato, () => [homework]);
      }
    }
  }

  @override
  void initState() {
    super.initState();
    _buildGroups();
  }

  @override
  void didUpdateWidget(covariant HomeworkGroupList oldWidget) {
    super.didUpdateWidget(oldWidget);
    _buildGroups();
  }

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      itemCount: daysAndHomework.entries.length,
      itemBuilder: (context, index) {
        var homework = daysAndHomework.entries.elementAt(index);
        return HomeworkGroup(
          homework: homework.value,
          time: homework.key,
        );
      },
    );
  }
}
