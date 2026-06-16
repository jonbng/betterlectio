import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/absence/cause.dart';
import 'package:betterlectio/topics/absence/widgets/absence_edit.dart';
import 'package:betterlectio/topics/absence/widgets/absence_percentage_circle.dart';

class AbsenceCauseCard extends StatefulWidget {
  const AbsenceCauseCard({super.key, required this.cause, this.onTap});
  final AbsenceCauses? cause;
  final Function()? onTap;

  @override
  State<AbsenceCauseCard> createState() => _AbsenceCauseCardState();
}

class _AbsenceCauseCardState extends State<AbsenceCauseCard> {
  late Color foregroundColor;
  late Color color;
  IconData? icon;
  void _selectColors() {
    foregroundColor = textColorFromCause(widget.cause, context);
    color = colorFromCause(widget.cause, context);
    if (widget.cause != null) {
      icon = iconFromCause(widget.cause!);
    }
  }

  @override
  void didUpdateWidget(covariant AbsenceCauseCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    _selectColors();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _selectColors();
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.hardEdge,
      color: color,
      child: InkWell(
        onTap: widget.onTap,
        child: ListTile(
            trailing: widget.cause != null
                ? Icon(
                    icon,
                    color: foregroundColor,
                  )
                : null,
            title: Text(
              widget.cause?.name ?? "Vælg årsag",
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(color: foregroundColor),
            )),
      ),
    );
  }
}
