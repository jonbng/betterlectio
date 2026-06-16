import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/topics/opgaver/bloc/opgaver_bloc.dart';

class FilterSheet extends StatelessWidget {
  const FilterSheet({
    super.key,
  });

  IconData iconFromFilter(AssignmentFilters filter) {
    switch (filter) {
      case AssignmentFilters.awaiting:
        return EvaIcons.clockOutline;
      case AssignmentFilters.delivered:
        return EvaIcons.checkmark;
      case AssignmentFilters.missing:
        return EvaIcons.close;
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: BlocBuilder<OpgaveBloc, AssignmentState>(
        builder: (context, state) {
          return Column(
            children: AssignmentFilters.values.map((filter) {
              return RadioListTile(
                secondary: Icon(iconFromFilter(filter)),
                title: Text(filter.name),
                value: filter,
                onChanged: (value) {
                  context.read<OpgaveBloc>().add(ToggleFilter(filter));
                },
                groupValue: state.appliedFilter,
              );
            }).toList(),
          );
        },
      ),
    );
  }
}
