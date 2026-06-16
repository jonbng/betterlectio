import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../topics/state/internet_error.dart';
import '../../topics/state/loading.dart';
import '../../utils/state_pattern.dart';

class StudentBlocBuilder<T extends StateStreamable<StatePattern<V>>, V>
    extends StatelessWidget {
  const StudentBlocBuilder(
      {super.key,
      this.bloc,
      required this.builder,
      this.small = false,
      this.customLoadingWidget});
  final T? bloc;
  final bool small;
  final Widget? customLoadingWidget;
  final Widget Function(BuildContext context, V state) builder;
  @override
  Widget build(BuildContext context) {
    return BlocBuilder<T, StatePattern<V>>(
      bloc: bloc,
      builder: (context, state) {
        if (state.state == States.error) {
          return const InternetErrorScreen();
        }
        if (state.status == States.loading) {
          return small
              ? (customLoadingWidget ?? Container())
              : const LoadingScreen();
        }
        return builder(context, state.state);
      },
    );
  }
}
