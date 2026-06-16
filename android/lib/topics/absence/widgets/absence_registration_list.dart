import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/absence/cause.dart';
import 'package:betterlectio/topics/absence/widgets/absence_registration_group.dart';
import 'package:betterlectio/widgets/layout/text_divider.dart';

class AbsenceRegistrationList extends StatefulWidget {
  const AbsenceRegistrationList(
      {super.key, required this.entries, required this.missing});

  final List<AbsenceCauseEntry> entries;
  final bool missing;

  @override
  State<AbsenceRegistrationList> createState() =>
      _AbsenceRegistrationListState();
}

class _AbsenceRegistrationListState extends State<AbsenceRegistrationList> {
  Map<DateTime, List<AbsenceCauseEntry>> daysAndEntries = {};

  void _buildDays() async {
    daysAndEntries = {};
    for (var entry in widget.entries) {
      var date = DateTime(entry.module.start.year, entry.module.start.month,
          entry.module.start.day);
      if (daysAndEntries.containsKey(date)) {
        daysAndEntries[date] = [...daysAndEntries[date]!, entry];
      } else {
        daysAndEntries.putIfAbsent(date, () => [entry]);
      }
    }
  }

  @override
  void initState() {
    super.initState();
    _buildDays();
  }

  @override
  void didUpdateWidget(covariant AbsenceRegistrationList oldWidget) {
    super.didUpdateWidget(oldWidget);
    _buildDays();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        TextDivider(
          text: widget.missing ? "Mangler" : "Udfyldte",
          primary: true,
        ),
        ...daysAndEntries.entries.map((dateEntry) => AbsenceRegistrationGroup(
            date: dateEntry.key, causes: dateEntry.value))
      ],
    );
  }
}
