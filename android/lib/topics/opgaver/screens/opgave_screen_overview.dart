import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/types/assignment.dart';
import 'package:betterlectio/topics/opgaver/bloc/opgaver_bloc.dart';
import 'package:betterlectio/topics/opgaver/widgets/filter_sheet.dart';
import 'package:betterlectio/topics/opgaver/widgets/opgave_list.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';

import '../../state/empty.dart';
import '../../state/loading.dart';

class OpgaveScreenOverview extends StatefulWidget {
  const OpgaveScreenOverview({super.key});

  @override
  State<OpgaveScreenOverview> createState() => _OpgaveScreenOverviewState();
}

class _OpgaveScreenOverviewState extends State<OpgaveScreenOverview> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          adSheet(const FilterSheet(), context);
        },
        child: Semantics(
            identifier: 'assignment-filter',
            child: const Icon(EvaIcons.funnelOutline)),
      ),
      appBar: const LppAppbar(
        title: "Opgaver",
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          context.read<OpgaveBloc>().add(RequestedLoadAssignments());
        },
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: BlocBuilder<OpgaveBloc, AssignmentState>(
                builder: (context, state) {
                  if (!state.loaded) {
                    return const LoadingScreen();
                  }

                  return OpgaveScreenFilterWidget(
                    assignmentState: state,
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class OpgaveScreenFilterWidget extends StatefulWidget {
  const OpgaveScreenFilterWidget({super.key, required this.assignmentState});
  final AssignmentState assignmentState;
  @override
  State<OpgaveScreenFilterWidget> createState() =>
      _OpgaveScreenFilterWidgetState();
}

class _OpgaveScreenFilterWidgetState extends State<OpgaveScreenFilterWidget> {
  List<AssignmentRef> assignments = [];

  void _filterAssignments() {
    assignments = widget.assignmentState.refs.where((element) {
      return widget.assignmentState.appliedFilter.name.contains(element.status);
    }).toList()
      ..sort(
        (a, b) =>
            widget.assignmentState.appliedFilter != AssignmentFilters.awaiting
                ? b.deadline.compareTo(a.deadline)
                : a.deadline.compareTo(b.deadline),
      );
  }

  @override
  void initState() {
    super.initState();
    _filterAssignments();
  }

  @override
  void didUpdateWidget(covariant OpgaveScreenFilterWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    _filterAssignments();
  }

  @override
  Widget build(BuildContext context) {
    if (assignments.isEmpty) {
      return const EmptyScreen();
    }
    return OpgaveList(opgaver: assignments);
  }
}
