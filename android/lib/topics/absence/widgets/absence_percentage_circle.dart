import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/absence/cause.dart';
import 'package:betterlectio/logic/app/typography.dart';

Color colorFromCause(AbsenceCauses? cause, BuildContext context) {
  switch (cause) {
    case AbsenceCauses.late:
      return Colors.yellow.shade600;
    case AbsenceCauses.sick:
      return Colors.red.shade900;
    case AbsenceCauses.privateRelations:
      return Colors.blue.shade900;
    case AbsenceCauses.schoolRelated:
      return Colors.green.shade900;
    default:
      return Theme.of(context).colorScheme.error;
  }
}

Color textColorFromCause(AbsenceCauses? cause, BuildContext context) {
  switch (cause) {
    case AbsenceCauses.late:
      return Colors.black;
    case AbsenceCauses.sick:
      return Colors.red.shade50;
    case AbsenceCauses.privateRelations:
      return Colors.blue.shade50;
    case AbsenceCauses.schoolRelated:
      return Colors.green.shade50;
    default:
      return Theme.of(context).colorScheme.onError;
  }
}

class AbsencePercentageCircle extends StatefulWidget {
  const AbsencePercentageCircle(
      {super.key, required this.percentage, required this.cause});
  final double percentage;
  final AbsenceCauses? cause;

  @override
  State<AbsencePercentageCircle> createState() =>
      _AbsencePercentageCircleState();
}

class _AbsencePercentageCircleState extends State<AbsencePercentageCircle> {
  late String percentage;

  void _buildState() {
    percentage = "${(widget.percentage * 100).round()}%";
  }

  @override
  void initState() {
    super.initState();
    _buildState();
  }

  @override
  void didUpdateWidget(covariant AbsencePercentageCircle oldWidget) {
    super.didUpdateWidget(oldWidget);
    _buildState();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(fit: StackFit.loose, alignment: Alignment.center, children: [
      Center(
        child: Text(
          percentage,
          style: BlTypography.bodySmall(context),
        ),
      ),
      AspectRatio(
        aspectRatio: 1.0,
        child: CircularProgressIndicator(
          color: colorFromCause(widget.cause, context),
          value: widget.percentage,
        ),
      ),
    ]);
  }
}
