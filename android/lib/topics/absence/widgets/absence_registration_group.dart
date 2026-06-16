import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/absence/cause.dart';
import 'package:betterlectio/topics/absence/widgets/absence_registration.dart';
import 'package:betterlectio/utils/helpers.dart';
import 'package:betterlectio/widgets/layout/text_divider.dart';

class AbsenceRegistrationGroup extends StatelessWidget {
  const AbsenceRegistrationGroup(
      {super.key, required this.date, required this.causes});
  final DateTime date;
  final List<AbsenceCauseEntry> causes;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          TextDivider(text: formatDateReadable(date)),
          ...causes.map((e) => AbsenceRegistration(absenceCause: e))
        ],
      ),
    );
  }
}
