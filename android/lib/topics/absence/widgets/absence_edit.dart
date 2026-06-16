import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/types/absence/cause.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/topics/absence/widgets/absence_cause_card.dart';
import 'package:betterlectio/topics/absence/widgets/causes_sheet.dart';
import 'package:betterlectio/topics/calendar/widgets/day_event.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/widgets/layout/padded_column.dart';
import '../bloc/registation.dart';

IconData iconFromCause(AbsenceCauses cause) {
  switch (cause) {
    case AbsenceCauses.sick:
      return EvaIcons.thermometerOutline;
    case AbsenceCauses.schoolRelated:
      return EvaIcons.bookOpenOutline;
    case AbsenceCauses.late:
      return EvaIcons.clockOutline;
    case AbsenceCauses.privateRelations:
      return EvaIcons.peopleOutline;
    case AbsenceCauses.other:
      return EvaIcons.moreVerticalOutline;
  }
}

class EditAbsence extends StatefulWidget {
  const EditAbsence({super.key, required this.cause});

  final AbsenceCauseEntry cause;
  @override
  State<EditAbsence> createState() => _EditAbsenceState();
}

class _EditAbsenceState extends State<EditAbsence> {
  late AbsenceCauses? _absenceCause;
  late TextEditingController explanationController;
  late String _explanation;
  @override
  void initState() {
    super.initState();
    _explanation = widget.cause.expandedCause;
    _absenceCause = widget.cause.cause;
    explanationController = TextEditingController(text: _explanation);
    explanationController.addListener(() {
      setState(() {
        _explanation = explanationController.text;
      });
    });
  }

  bool validate() {
    return _absenceCause != null &&
        (_explanation != widget.cause.expandedCause ||
            _absenceCause != widget.cause.cause);
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24.0),
      child: PaddedColumn(
        padding: 4.0,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "Rediger Fravær",
            style: BlTypography.headlineSmall(context),
          ),
          InputDecorator(
              decoration: const InputDecoration(
                  label: Text("Modul"), border: InputBorder.none),
              child: dayEventWidget(
                  double.infinity, widget.cause.module, context, 100.0)),
          InputDecorator(
              decoration: const InputDecoration(
                  label: Text("Årsag"), border: InputBorder.none),
              child: AbsenceCauseCard(
                cause: _absenceCause,
                onTap: () {
                  adSheet(CausesSheet(
                    onSelect: (selectedCause) {
                      setState(() {
                        _absenceCause = selectedCause;
                      });
                    },
                  ), context);
                },
              )),
          InputDecorator(
            decoration: const InputDecoration(
                border: InputBorder.none,
                label: Text(
                  "Forklaring",
                )),
            child: TextField(
              maxLines: 3,
              controller: explanationController,
              decoration: InputDecoration(
                  hintText: "Min seng var meget rar i dag...",
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8.0))),
            ),
          ),
          const SizedBox(
            height: 8.0,
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              FloatingActionButton.extended(
                  onPressed: validate()
                      ? () async {
                          Navigator.pop(context);
                          var newEntry = widget.cause.copyWith(
                              cause: _absenceCause,
                              expandedCause: _explanation);
                          context
                              .read<AbsenceRegistrationsCubit>()
                              .update(newEntry);
                        }
                      : null,
                  label: const Text("Gem"),
                  icon: const Icon(EvaIcons.save)),
            ],
          )
        ],
      ),
    );
  }

  @override
  void dispose() {
    super.dispose();
    explanationController.dispose();
  }
}
